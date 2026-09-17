#!/usr/bin/env python3
"""Verify or materialize the pinned K3s air-gap bundle on the existing OCI A1.

Both paths read the private Object Storage object with the instance principal.
`probe` is observation-only. `install` downloads the same pinned bytes as the
unprivileged Run Command user and delegates only the fixed, already-provisioned
root copy operation to `chess-studio-k3s-assets`. Neither path creates or starts
a K3s service.
"""
from __future__ import annotations

import argparse
import shlex

from oci_run_command import (
    OCI_SDK_VERSION,
    RUN_COMMAND_INLINE_MAX_BYTES,
    assert_nonsecret_command,
    config_from_env,
    diagnose_plugin,
    execute,
    runtime_namespace,
)

BUCKET = "chess-studio-staging-runtime"
BUNDLE_OBJECT = "k3s/bootstrap/k3s-airgap-arm64.tar.gz"
MANIFEST_OBJECT = "k3s/bootstrap/manifest.json"
BUNDLE_SHA256 = "db0972ea4c9439e238e777f26d579ae29865f22f05f70c9a01989cc772611256"
BUNDLE_SIZE = 240779539
K3S_VERSION = "v1.36.4+k3s1"
K3S_BINARY_SHA256 = "c920706346d5ad4e5cd3c7bf1bb09ce71ebe07fec829e513e40f1caf98aed8bb"
K3S_IMAGES_SHA256 = "9d3c4c2197bcf857ca17633aa393bad683cc982ddd408620f93036a3cca953b5"
MAX_BUNDLE_BYTES = 300 * 1024 * 1024
OK_MARKER = "OCI_K3S_BUNDLE_PROBE_OK"
INSTALL_OK_MARKER = "OCI_K3S_ASSETS_INSTALLED_OK"
ROOT_INSTALLER = "/usr/local/sbin/chess-studio-k3s-assets"
STAGED_BUNDLE = "/tmp/chess-studio-k3s-bundle.tar.gz"


def _bounded(command: str, label: str) -> str:
    assert_nonsecret_command(command)
    size = len(command.encode("utf-8"))
    if size > RUN_COMMAND_INLINE_MAX_BYTES:
        raise SystemExit(
            f"K3s {label} payload exceeds Run Command inline limit: "
            f"{size} > {RUN_COMMAND_INLINE_MAX_BYTES}"
        )
    return command


def probe_command(namespace: str) -> str:
    command = f"""set -euo pipefail
venv="${{HOME:-/tmp}}/.cache/chess-studio-oci-runtime"
test -x "$venv/bin/python" || {{ echo 'K3S_PROBE_OCI_VENV_MISSING' >&2; exit 66; }}
"$venv/bin/python" -c 'import oci; raise SystemExit(0 if oci.__version__ == "{OCI_SDK_VERSION}" else 1)' || {{ echo 'K3S_PROBE_OCI_SDK_MISMATCH' >&2; exit 67; }}
K3S_NAMESPACE={shlex.quote(namespace)} "$venv/bin/python" - <<'PY'
import hashlib,json,os,re,tarfile,tempfile
import oci
ns=os.environ['K3S_NAMESPACE']; bucket='{BUCKET}'; manifest_name='{MANIFEST_OBJECT}'; bundle_name='{BUNDLE_OBJECT}'
signer=oci.auth.signers.InstancePrincipalsSecurityTokenSigner()
client=oci.object_storage.ObjectStorageClient(config={{}},signer=signer)
r=client.get_object(ns,bucket,manifest_name); raw=r.data.content
if not isinstance(raw,(bytes,bytearray)): raw=r.data.raw.read()
if not raw or len(raw)>65536: raise SystemExit('invalid K3s manifest size')
m=json.loads(bytes(raw).decode())
if m.get('schema')!=1 or m.get('architecture')!='arm64': raise SystemExit('invalid K3s manifest contract')
if m.get('bundle_object')!=bundle_name: raise SystemExit('unexpected K3s bundle object')
sha=str(m.get('bundle_sha256','')); size=int(m.get('bundle_size',0))
if not re.fullmatch(r'[0-9a-f]{{64}}',sha) or not 0<size<={MAX_BUNDLE_BYTES}: raise SystemExit('invalid K3s bundle metadata')
fd,path=tempfile.mkstemp(prefix='chess-k3s-probe-',suffix='.tar.gz'); os.close(fd)
try:
 r=client.get_object(ns,bucket,bundle_name); header=int(r.headers.get('content-length','-1'))
 if header!=size: raise SystemExit('K3s bundle content-length mismatch')
 h=hashlib.sha256(); total=0
 with open(path,'wb') as out:
  for chunk in r.data.raw.stream(1024*1024,decode_content=False):
   out.write(chunk); h.update(chunk); total+=len(chunk)
 if total!=size or h.hexdigest()!=sha: raise SystemExit('K3s bundle digest mismatch')
 with tarfile.open(path,'r:gz') as archive:
  files={{x.name for x in archive.getmembers() if x.isfile()}}
  expected={{'bin/k3s','images/k3s-airgap-images-arm64.tar.zst','bootstrap/install-k3s-airgap.sh','manifest.json'}}
  if files!=expected: raise SystemExit('unexpected K3s bundle layout')
  stream=archive.extractfile('manifest.json')
  if stream is None: raise SystemExit('embedded K3s manifest missing')
  embedded=json.load(stream)
  for key in ('architecture','k3s_version','components'):
   if embedded.get(key)!=m.get(key): raise SystemExit('embedded K3s manifest mismatch')
finally:
 try: os.unlink(path)
 except FileNotFoundError: pass
print('{OK_MARKER}',f'bytes={{size}}',f'sha256={{sha}}',f'version={{m.get("k3s_version","")}}')
PY
"""
    return _bounded(command, "probe")


def install_command(namespace: str) -> str:
    command = f"""set -euo pipefail
venv="${{HOME:-/tmp}}/.cache/chess-studio-oci-runtime"; tmp='{STAGED_BUNDLE}'
trap 'rm -f "$tmp"' EXIT
test -x "$venv/bin/python" || {{ echo 'K3S_INSTALL_OCI_VENV_MISSING' >&2; exit 66; }}
test -x '{ROOT_INSTALLER}' || {{ echo 'K3S_ROOT_INSTALLER_MISSING' >&2; exit 68; }}
"$venv/bin/python" -c 'import oci; raise SystemExit(0 if oci.__version__ == "{OCI_SDK_VERSION}" else 1)' || {{ echo 'K3S_INSTALL_OCI_SDK_MISMATCH' >&2; exit 67; }}
K3S_NAMESPACE={shlex.quote(namespace)} K3S_TMP="$tmp" "$venv/bin/python" - <<'PY'
import hashlib,os
import oci
path=os.environ['K3S_TMP']; ns=os.environ['K3S_NAMESPACE']
try: os.unlink(path)
except FileNotFoundError: pass
flags=os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW
fd=os.open(path,flags,0o600); h=hashlib.sha256(); total=0
try:
 r=oci.object_storage.ObjectStorageClient(config={{}},signer=oci.auth.signers.InstancePrincipalsSecurityTokenSigner()).get_object(ns,'{BUCKET}','{BUNDLE_OBJECT}')
 if int(r.headers.get('content-length','-1'))!={BUNDLE_SIZE}: raise SystemExit('K3s bundle content-length mismatch')
 with os.fdopen(fd,'wb',closefd=False) as out:
  for chunk in r.data.raw.stream(1024*1024,decode_content=False): out.write(chunk); h.update(chunk); total+=len(chunk)
  out.flush(); os.fsync(out.fileno())
 os.close(fd); fd=-1
 if total!={BUNDLE_SIZE} or h.hexdigest()!='{BUNDLE_SHA256}': raise SystemExit('K3s bundle digest mismatch')
except BaseException:
 if fd>=0:
  try: os.close(fd)
  except OSError: pass
 try: os.unlink(path)
 except FileNotFoundError: pass
 raise
PY
sudo --non-interactive '{ROOT_INSTALLER}' "$tmp"
"$venv/bin/python" - <<'PY'
import hashlib,os
from pathlib import Path
def sha(path):
 h=hashlib.sha256()
 with open(path,'rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
 return h.hexdigest()
if sha('/usr/local/bin/k3s')!='{K3S_BINARY_SHA256}': raise SystemExit('installed K3s binary digest mismatch')
if sha('/var/lib/rancher/k3s/agent/images/k3s-airgap-images-arm64.tar.zst')!='{K3S_IMAGES_SHA256}': raise SystemExit('installed K3s images digest mismatch')
marker=Path('/var/lib/chess-studio/K3S_AIRGAP_ASSETS_READY').read_text().strip()
if 'version={K3S_VERSION}' not in marker or 'bundle_sha256={BUNDLE_SHA256}' not in marker: raise SystemExit('K3s asset marker mismatch')
for unit in ('/etc/systemd/system/k3s.service','/etc/systemd/system/k3s-agent.service','/etc/systemd/system/multi-user.target.wants/k3s.service'):
 if os.path.lexists(unit): raise SystemExit('K3s service unexpectedly exists')
print(marker)
PY
echo '{INSTALL_OK_MARKER} bytes={BUNDLE_SIZE} sha256={BUNDLE_SHA256} version={K3S_VERSION}'
"""
    return _bounded(command, "install")


def _run(oci: object, command: str, marker: str, display_name: str) -> str:
    config = config_from_env(oci)
    diagnose_plugin(oci, config, wait_for_registration=True)
    namespace = runtime_namespace(oci, config)
    payload = probe_command(namespace) if command == "probe" else install_command(namespace)
    output = execute(oci, config, payload, display_name=display_name, timeout=600)
    if marker not in output:
        raise SystemExit(f"A1 K3s {command} did not return its success marker")
    return output


def probe(oci: object) -> str:
    return _run(oci, "probe", OK_MARKER, "chess-studio-k3s-bundle-probe")


def install(oci: object) -> str:
    return _run(oci, "install", INSTALL_OK_MARKER, "chess-studio-k3s-assets-install")


def self_test() -> None:
    probe_payload = probe_command("sample_namespace")
    install_payload = install_command("sample_namespace")
    assert OK_MARKER in probe_payload and INSTALL_OK_MARKER in install_payload
    for payload in (probe_payload, install_payload):
        assert BUCKET in payload and BUNDLE_OBJECT in payload
        assert "InstancePrincipalsSecurityTokenSigner" in payload
        assert "pip install" not in payload
        assert "curl " not in payload and "wget " not in payload
        assert "systemctl" not in payload
        assert "k3s server" not in payload and "k3s agent" not in payload
        assert len(payload.encode("utf-8")) <= RUN_COMMAND_INLINE_MAX_BYTES
    assert MANIFEST_OBJECT in probe_payload and "tarfile.open" in probe_payload
    assert "os.unlink(path)" in probe_payload
    assert ROOT_INSTALLER in install_payload
    assert STAGED_BUNDLE in install_payload
    assert "os.O_NOFOLLOW" in install_payload
    assert "sudo --non-interactive" in install_payload
    assert BUNDLE_SHA256 in install_payload and str(BUNDLE_SIZE) in install_payload
    print(
        "OCI K3s A1 bundle self-test: OK · "
        f"probe={len(probe_payload.encode('utf-8'))} bytes · "
        f"install={len(install_payload.encode('utf-8'))} bytes"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("probe", "install", "self-test"), nargs="?", default="self-test")
    args = parser.parse_args()
    if args.command == "self-test":
        self_test()
        return
    try:
        import oci
    except ImportError as exc:
        raise SystemExit(f"OCI Python SDK {OCI_SDK_VERSION} is required") from exc
    if args.command == "probe":
        probe(oci)
    else:
        install(oci)


if __name__ == "__main__":
    main()

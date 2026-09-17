#!/usr/bin/env python3
"""Prove the existing OCI A1 can privately read and verify the K3s bundle.

This is a non-installing probe: the node reads Object Storage with its instance
principal, streams the bundle to /tmp, verifies it, and removes the temporary file.
No K3s bytes are installed and no service is started.
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
MAX_BUNDLE_BYTES = 300 * 1024 * 1024
OK_MARKER = "OCI_K3S_BUNDLE_PROBE_OK"


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
    assert_nonsecret_command(command)
    if len(command.encode("utf-8")) > RUN_COMMAND_INLINE_MAX_BYTES:
        raise SystemExit(
            f"K3s probe payload exceeds Run Command inline limit: {len(command.encode('utf-8'))} > {RUN_COMMAND_INLINE_MAX_BYTES}"
        )
    return command


def probe(oci: object) -> str:
    config = config_from_env(oci)
    diagnose_plugin(oci, config, wait_for_registration=True)
    namespace = runtime_namespace(oci, config)
    output = execute(
        oci,
        config,
        probe_command(namespace),
        display_name="chess-studio-k3s-bundle-probe",
        timeout=600,
    )
    if OK_MARKER not in output:
        raise SystemExit("A1 K3s bundle probe did not return its success marker")
    return output


def self_test() -> None:
    command = probe_command("sample_namespace")
    assert OK_MARKER in command
    assert BUCKET in command
    assert BUNDLE_OBJECT in command
    assert MANIFEST_OBJECT in command
    assert "InstancePrincipalsSecurityTokenSigner" in command
    assert "tarfile.open" in command
    assert "os.unlink(path)" in command
    assert "pip install" not in command
    assert "curl " not in command
    assert "wget " not in command
    assert "systemctl" not in command
    assert "install " not in command
    assert len(command.encode("utf-8")) <= RUN_COMMAND_INLINE_MAX_BYTES
    print(f"OCI K3s A1 bundle probe self-test: OK · payload={len(command.encode('utf-8'))} bytes")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("probe", "self-test"), nargs="?", default="self-test")
    args = parser.parse_args()
    if args.command == "self-test":
        self_test()
        return
    try:
        import oci
    except ImportError as exc:
        raise SystemExit(f"OCI Python SDK {OCI_SDK_VERSION} is required") from exc
    probe(oci)


if __name__ == "__main__":
    main()

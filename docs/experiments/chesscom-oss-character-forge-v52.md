# CHESSCOM · OSS Character Forge V52 (CPU, CC0, review-only)

## What this PR actually produces

A **real third-party Quaternius SWAT 3D mesh** imported, inspected, exported and rendered in **eight perspectives by Blender headless** on an Ubuntu GitHub runner, with a contact sheet and a 72px high tactical-zoom readability test.

It does **not** claim to be the approved Sven, add new gameplay animation clips, edit the current Chesscom scene, or publish a model to R2.

The [Quaternius Ultimate Modular Men Pack](https://quaternius.com/packs/ultimatemodularcharacters.html) is published under CC0-1.0. The public [Fatal Funnel](https://github.com/euuuuuuan/fatal-funnel-public) mirror documents Quaternius provenance, redistributability and license under CREDITS.md and LICENSES/CC0-1.0.txt. No unpinned latest downloads.

**Exact binary pin:**

| Field | Value |
| --- | --- |
| Mirror | euuuuuuan/fatal-funnel-public |
| Commit | 29a6bdfd01ad175c389cbd0bac80c30f926ff96b |
| Path | packages/renderer/assets/models/quaternius-men/swat.glb |
| Git blob SHA-1 | 280b2776eee2af7e131db22dd7a32b1e99764a12 |
| Size | 1,560,900 bytes |
| Author/license | Quaternius / CC0-1.0 |

SHA-256 of the downloaded bytes is recorded in the source receipt. Intake verifies **both Git blob SHA-1 and exact byte length** before Blender runs; if GitHub is unavailable or the content changes, the job fails.

## How to run

GitHub Actions → **CHESSCOM · OSS Character Forge V52** → Run workflow.
The same workflow runs on PRs that change its five scoped source/workflow files. Blender is installed with apt on a stock ubuntu-24.04 runner. No GPU/CUDA, AI vendor, paid API, Git LFS, OCI or R2 keys.

Artifact: **chesscom-oss-cc0-v52-review-RUN_ID**.

- source-receipt.json: immutable provenance, license and actual GLB metadata.
- blender-report.json: mesh/armature/action introspection and PNG hashes.
- quaternius-cc0-preview.glb: actual Blender-exported test model, **not Sven**.
- view-00-N.png through view-07-NW.png: eight genuine camera renders.
- eight-view-contact.png: full-size four-column review.
- tactical-72px-contact.png: character rendered at gameplay-scale height.

No automatically invented animation clips. If the source has zero actions, the report says so. No R2 publication, no default substitution, no runtime changes.

## Acceptance gate

1. **Inspect all real PNGs.** Is this SWAT model worth considering as a starting body for Sven? If not, discard it. No geometric lipstick.
2. Check imported skeleton, skin and animations. Missing V40/V47 rig requirements must be implemented with actual rigging/retargeting, not fabricated clip metadata.
3. Customize **real model geometry, textures and equipment** against canonical V41/V48: helmet/balaclava, vest, weapon/hand grips, backpack, distinct silhouette and a MuzzleSocket.
4. Review eight views, idle/walk/fire/damage/death, foot contact and weapon alignment from the same GLB SHA.
5. Only then exercise the Babylon A/B at 1600x900 and 390x844, including cover, picking, performance and shooting. Preserve V4 fallback; default remains unchanged.

## Offline/local commands

    python3 -m unittest discover -s scripts/art -p 'test_chesscom_oss_source_v52.py'
    python3 scripts/art/chesscom_oss_source_v52.py \
      --source-glb /path/to/pinned/swat.glb --receipt /tmp/cc0/source-receipt.json
    blender --background --noaudio --python-exit-code 19 \
      --python scripts/blender/chesscom_oss_turntable_v52.py -- \
      --source-glb /path/to/pinned/swat.glb --output-dir /tmp/cc0
    python3 scripts/art/chesscom_oss_contact_v52.py --output-dir /tmp/cc0

This CPU workflow stays separate from app builds/staging promotion. Standard GitHub Actions minutes are still subject to repository plan limits; do not assume unlimited free runners.

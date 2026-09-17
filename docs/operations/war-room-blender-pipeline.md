# War Room premium · Blender pipeline

The War Room has a deterministic Blender generator for the static room shell. It regenerates an editable `.blend`, a runtime `.glb`, a 1600×900 hero preview and a JSON manifest from source code, so high-fidelity art can be iterated without committing large generated blobs to Git.

The preview includes board squares and representative chess pieces for art-direction review, but those meshes are tagged `preview-only` and excluded from the runtime shell. Live chess state remains owned by the current renderer. `WR_ANCHOR_board_origin` is the explicit alignment contract between the Blender shell and the interactive board.

The dedicated pull-request workflow runs Blender 5.2 through the repository's canonical cached setup, validates the scene/artifact envelope, and uploads the generated files for inspection. Once the shell is visually approved, later iterations can bake higher-resolution material maps and integrate the GLB through the asset CDN without changing chess rules or interaction.

<p align="center"><img src="ui/assets/icon-round.png" width="150" /></p>

# <p align="center">Gamejin</p>

Gamejin is a libretro frontend that aims to run entirely in your browser, desktop or mobile.
* No installation on the end-devices.
* Near-native performances thanks to WebAssembly.
* Wide range of supported/compatible cores (... soon).
* Progressive Web Application entirely accessible offline.

Gamejin currently runs on most recent browsers, but your experience will probably be better on Chrome and Safari.

***Disclaimer**: development is still in progress. Back up local saves before updates.*

# Supported features

- [x] All the systems described in the [Folder structure](#folder-structure).
- [x] Save files and cheats (stored inside your browser's storage).
- [x] Core-specific configurations override.
- [x] Multi-touch controller with either a D-pad.
- [x] Touch inputs for the Nintendo DS, when the gamepad is hidden.
- [x] Save and restore states, backup and restore save files.
- [x] Fast-forward up to 4 times the original speed.
- [x] Minimalistic platform-specific user interface.
- [x] Entirely running offline from your homescreen.

# Folder structure

Games must be organized as follows, inside a `games` folder next to the application binaries:

```
games
├── Game Boy
├── Game Boy Color
├── Game Boy Advance
├── Nintendo DS
├── Master System
├── NES
├── SNES
├── Mega Drive
├── Nintendo 64
└── PlayStation
```

# Build & Run

## Build

Install the following dependencies: **Emscripten**, **yarn**, **make**, **jq**, **wget** and **zip**, then build the application:
```bash
git submodule update --init --recursive
make       # Build cores, libraries and the application
make pages # Same as `make`, but also outputs a static site in dist/
make pack  # Same as `make`, but also outputs binaries in a zip file
make watch # Same as `make`, but also rebuild on source file changes

# Additional flags:
# * DEBUG=1   : build app and ui in debug mode
# * UI_ONLY=1 : rebuild only on UI changes when watching
# * QUIET=    : enable verbose build mode
```

`emsdk` is not vendored. Activate it before building, or pass the Emscripten path explicitly:

```bash
EMSCRIPTEN=/path/to/emsdk/upstream/emscripten make pages
```

To run the static site locally, use the bundled server so browser APIs such as
`SharedArrayBuffer` are enabled:

```bash
node scripts/serve-pages.mjs dist 8000
```

## Cores

`cores/cores.json` should contain only cores that are actually present as submodules under `cores/`.

To add another core later, add the submodule and then add its metadata back to `cores/cores.json`.

# Credits

- [Libretro](https://github.com/libretro/) for all emulation cores.
- [glif.app](https://glif.app/) for the AI generated icons.

# License

Gamejin is licensed under the [GNU General Public License v3.0](LICENSE.md).

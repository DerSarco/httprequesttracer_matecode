# Third-Party Notices

This project includes and depends on third-party open source software.
Each dependency remains licensed by its original authors under its own terms.

This file lists the direct dependencies used in this repository at the time of writing.

## JavaScript/TypeScript dependencies

### Runtime dependencies

| Package | Version | License | Repository |
| --- | --- | --- | --- |
| `@tauri-apps/api` | `2.10.1` | `Apache-2.0 OR MIT` | https://github.com/tauri-apps/tauri |
| `@tauri-apps/plugin-opener` | `2.5.3` | `MIT OR Apache-2.0` | https://github.com/tauri-apps/plugins-workspace |
| `react` | `19.2.4` | `MIT` | https://github.com/facebook/react |
| `react-dom` | `19.2.4` | `MIT` | https://github.com/facebook/react |

### Development and testing dependencies

| Package | Version | License | Repository |
| --- | --- | --- | --- |
| `@tauri-apps/cli` | `2.10.0` | `Apache-2.0 OR MIT` | https://github.com/tauri-apps/tauri |
| `@testing-library/jest-dom` | `6.9.1` | `MIT` | https://github.com/testing-library/jest-dom |
| `@testing-library/react` | `16.3.2` | `MIT` | https://github.com/testing-library/react-testing-library |
| `@testing-library/user-event` | `14.6.1` | `MIT` | https://github.com/testing-library/user-event |
| `@types/react` | `19.2.14` | `MIT` | https://github.com/DefinitelyTyped/DefinitelyTyped |
| `@types/react-dom` | `19.2.3` | `MIT` | https://github.com/DefinitelyTyped/DefinitelyTyped |
| `@vitejs/plugin-react` | `4.7.0` | `MIT` | https://github.com/vitejs/vite-plugin-react |
| `@vitest/coverage-v8` | `2.1.9` | `MIT` | https://github.com/vitest-dev/vitest |
| `jsdom` | `25.0.1` | `MIT` | https://github.com/jsdom/jsdom |
| `typescript` | `5.8.3` | `Apache-2.0` | https://github.com/microsoft/TypeScript |
| `vite` | `7.3.1` | `MIT` | https://github.com/vitejs/vite |
| `vitest` | `2.1.9` | `MIT` | https://github.com/vitest-dev/vitest |

## Rust dependencies

### Direct dependencies

| Crate | Version | License | Repository |
| --- | --- | --- | --- |
| `brotli` | `8.0.2` | `BSD-3-Clause AND MIT` | https://github.com/dropbox/rust-brotli |
| `dirs` | `6.0.0` | `MIT OR Apache-2.0` | https://github.com/soc/dirs-rs |
| `flate2` | `1.1.9` | `MIT OR Apache-2.0` | https://github.com/rust-lang/flate2-rs |
| `http-body-util` | `0.1.3` | `MIT` | https://github.com/hyperium/http-body |
| `hudsucker` | `0.24.0` | `MIT OR Apache-2.0` | https://github.com/omjadas/hudsucker |
| `serde` | `1.0.228` | `MIT OR Apache-2.0` | https://github.com/serde-rs/serde |
| `serde_json` | `1.0.149` | `MIT OR Apache-2.0` | https://github.com/serde-rs/json |
| `tauri` | `2.10.2` | `Apache-2.0 OR MIT` | https://github.com/tauri-apps/tauri |
| `tauri-plugin-opener` | `2.5.3` | `Apache-2.0 OR MIT` | https://github.com/tauri-apps/plugins-workspace |
| `tokio` | `1.49.0` | `MIT` | https://github.com/tokio-rs/tokio |

### Build dependency

| Crate | Version | License | Repository |
| --- | --- | --- | --- |
| `tauri-build` | `2.5.5` | `Apache-2.0 OR MIT` | https://github.com/tauri-apps/tauri |

## Notes

- Versions were collected from local `node_modules` and `cargo metadata` output.
- Transitive dependencies are not exhaustively listed here.
- If a license requires preserving notices, those notices remain in the upstream package sources.

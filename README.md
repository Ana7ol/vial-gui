### vial-gui

# Docs and getting started

### Please visit [get.vial.today](https://get.vial.today/) to get started with Vial

Vial is an open-source cross-platform (Windows, Linux and Mac) GUI and a QMK fork for configuring your keyboard in real time.


![](https://get.vial.today/img/vial-win-1.png)


---


#### Releases

Visit https://get.vial.today/ to download a binary release of Vial.

#### Development

Python 3.6 is recommended (3.6 is the latest version that is officially supported by `fbs`).

Install dependencies:

```
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

To launch the application afterwards:

```
source venv/bin/activate
fbs run
```

#### This fork

- The default Vial GUI keyboard layout is `German (QWERTZ)`.
- The macro recorder resolves recorded characters through the selected Vial layout.
- `Exact text (German)` macros compile shell punctuation to explicit German HID key taps instead of QMK's US send-string table.
- Quantum keycode definitions are available in the app under `About` -> `Quantum keycode reference...`.
- Corne v4 firmware capacity notes live in [`docs/corne-v4-vial.md`](docs/corne-v4-vial.md).

#### Testing

The upstream test workflow builds Python 3.6 and runs:

```
pytest -v src/main/python/test
```

On a local machine, install `test-requirements.txt` in the project virtualenv before running the test suite.

#### Public website

The GitHub Pages workflow compiles this GUI through the pinned upstream
`vial-kb/vial-web` WebAssembly toolchain. In Chrome or Edge, the Connect
keyboard button requests the Vial WebHID interface, reads the firmware
definition, and opens the detected keyboard layout directly in the browser.

GitHub Pages cannot set the COOP/COEP response headers required by Qt's
threaded WebAssembly build. The site includes a same-origin isolation service
worker so the public Pages URL can run the configurator after one automatic
first-visit reload.

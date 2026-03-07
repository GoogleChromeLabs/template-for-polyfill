# Declarative partial updates polyfill

This is a partial polyfill for the [Declarative partial updates API](https://github.com/WICG/declarative-partial-updates/).

The polyfill includes a implementation of declarative patching using `template` elements as described in the [Patching explainder](https://github.com/WICG/declarative-partial-updates/blob/main/patching-explainer.md).

Other implementations of the Declarative partial updates API are not yet implemented

## Requirements

A browser that supports ES6/ES2015 is required for this polyfill.

## Usage

### Include via npm and a bundler

**Note: not added to npm yet**

```console
npm install declarative-partial-updates-polyfill
```

```js
<script type="module" src="./declarative-partial-updates-polyfill/dist/declarative-partial-updates-polyfill.js">
```

### Include via unpkg

**Note: not added to npm yet**

```html
<script src="https://unpkg.com/declarative-partial-updates-polyfill"></script>
```

### Building from source

```console
git clone https://github.com/GoogleChromeLabs/declarative-partial-updates-polyfill
cd declarative-partial-updates-polyfill
npm i
npm test        # Tests should pass
npm run build   # Outputs minified polyfill to dist/
```

```html
<script src="/path_to_polyfill/declarative-partial-updates-polyfill.js"></script>
```

## License

[Apache 2.0](LICENSE)

## Contributing

We'd love to accept your patches and contributions to this project. See the enclosed [`CONTRIBUTING.md`](./CONTRIBUTING.md) for details.

## Disclaimer

This is not an officially supported Google product. This project is not eligible for the [Google Open Source Software Vulnerability Rewards Program](https://bughunters.google.com/open-source-security).

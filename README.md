# ElectronModLoader

ElectronModLoader launches an Electron app with a loopback Chrome DevTools Protocol endpoint injecting a small JavaScript mod runtime into each renderer.

## Run it

With the taget not launched, run:

```powershell
.\ElectronModLoader.exe --game "path\to\target.exe" --mods ".\mods"
```

**F1** opens the mod menu. By default, the loader uses the `mods` dir.

## Write a mod
TODO
```js
ElectronMods.register(
  {
    id: 'my.first-mod',
    name: 'Hello Mod',
    version: '0.0.1',
    description: 'Hello',

    init(api)
    {
      api.menu.button(
        'hello?',
        () =>
        {
          api.toast('Hi.');
        }
      );

      api.menu.toggle(
        'Feature enabled',
        false,
        enabled =>
        {
          console.log('Feat State:', enabled);
        }
      );
    }
  }
);
```
### Menu API
TODO

```js
api.menu.section( 'Heading' );

api.menu.button(
  'Run action',
  () => doSomething(),
  {
    buttonText: 'Run',
    hint: 'Optional help'
  }
);

api.menu.toggle(
  'Enabled',
  false,
  value => setEnabled(value),
  {
    hint: 'Optional help'
  }
);

api.menu.number(
  'Amount',
  10,
  value => setAmount(value),
  {
    min: 0,
    max: 100,
    step: 1
  }
);

api.menu.text(
  'Name',
  '',
  value => setName(value),
  {
    placeholder: 'Value'
  }
);

api.menu.show();
api.menu.hide();
api.menu.toggleVisible();
```

Each control call returns a handle with `get()`, `set(value)`, `remove()`

### Runtime helpers

```js
// wait until app creates a global object.
const vm = await api.waitFor(() => window.vm, { timeout: 15000 , interval: 50 } );

// store JSON-serializable per-mod settings
api.storage.set( 'enabled', true );

const enabled = api.storage.get( 'enabled', false );

// patch a method & restore it when the page unloads
api.patch(
  game,
  'takeDamage',
  original => function (amount)
  {
    return original( amount * 0.1 );
  }
);

// register any other cleanup
const timer = setInterval( tick, 100 );

api.onCleanup( () => clearInterval( timer ) );
```

## Building

.NET 10 SDK is required to build.

```powershell
.\publish.ps1 win-x64
# written to `dist\win-x64`
```
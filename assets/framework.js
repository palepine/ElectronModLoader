/*
  ElectronModLoader Copyright (C) 2026 palepine

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.
*/
(

() =>
{
  'use strict';

  if ( globalThis.ElectronMods?.frameworkVersion ) return;

  const FRAMEWORK_VERSION = '0.1.0';
  
  const mods = new Map();
  
  const loadedFiles = new Set();
  
  const pendingControls = [];
  
  const state =
  {
    host: null,
    shadow: null,
    panel: null,
    content: null,
    status: null,
    visible: false,
    ready: false
  };

  const log = (...values) => console.log( '[Mods]', ...values );
  
  const report = (label, error) =>
  {
    console.error( `[Mods] ${label}`, error );
    toast( `${label}: ${error?.message || error}`, 'error' );
  };

  const safeCall = (label, callback, ...args) =>
  {
    try
    {
      const result = callback( ...args );

      if ( result?.catch )
      {
        result.catch( error => report( label, error ) );
      }

      return result;
      
    }
    catch (error)
    {
      report( label, error );
      return undefined;
    }

  };

  const element = (tag, className, text) =>
  {
    const value = document.createElement( tag );

    if (className)
    {
      value.className = className;
    }

    if (text !== undefined)
    {
      value.textContent = text;
    }

    return value;
  };

  function mount()
  {
    if ( state.ready || !document.documentElement )
    {
      return;
    }

    state.ready = true;

    const host = element('div');
    
    host.id = 'electron-mod-loader-root';
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;';

    const shadow = host.attachShadow( { mode: 'open' } );

    const style = element('style');

    style.textContent = `
      :host
      {
        color-scheme: dark;
      }
      *
      {
        box-sizing: border-box;
      }
      .eml-panel
      {
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        width: min(680px, calc(100vw - 32px)); max-height: min(760px, calc(100vh - 32px));
        display: none; flex-direction: column; overflow: hidden; pointer-events: auto;
        color: #eef2ff; background: rgba(12, 15, 25, .96); border: 1px solid #43506d;
        border-radius: 14px; box-shadow: 0 24px 80px rgba(0, 0, 0, .65);
        font: 14px/1.4 Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        backdrop-filter: blur(16px);
      }
      .eml-panel.open
      {
        display: flex;
      }

      .eml-header
      {
        display: flex; align-items: center; gap: 12px; padding: 15px 17px; border-bottom: 1px solid #30394f;
      }
      .eml-brand
      {
        font-size: 16px; font-weight: 750; letter-spacing: .01em;
      }
      .eml-version
      {
        color: #8f9bb8; font-size: 12px;
      }
      .eml-spacer
      {
        flex: 1;
      }
      .eml-key
      {
        padding: 3px 7px;
        color: #bac3db;
        background: #232a3d;
        border: 1px solid #3b4661;
        border-radius: 6px;
        font-size: 11px;
      }
      .eml-close
      {
        width: 30px;
        height: 30px;
        padding: 0;
        color: #c9d2e8;
        background: transparent;
        border: 0;
        border-radius: 7px;
        font-size: 20px;
        cursor: pointer;
      }
      .eml-close:hover
      {
        background: #2a3248;
      }
      .eml-content
      {
        padding: 14px;
        overflow: auto;
      }
      .eml-empty
      {
        padding: 30px 12px;
        color: #9aa6c2;
        text-align: center;
      }
      .eml-mod
      {
        margin-bottom: 12px;
        overflow: hidden;
        background: #171c2a;
        border: 1px solid #30394f;
        border-radius: 10px;
      }
      .eml-mod-head
      {
        display: flex;
        align-items: baseline;
        gap: 9px;
        padding: 11px 13px;
        background: #1d2435;
        border-bottom: 1px solid #30394f;
      }
      .eml-mod-name
      {
        font-weight: 700;
      }
      .eml-mod-version
      {
        color: #8794b2;
        font-size: 11px;
      }
      .eml-mod-description
      {
        margin-left: auto;
        max-width: 55%;
        overflow: hidden;
        color: #9aa6c2;
        font-size: 12px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .eml-controls
      {
        padding: 6px 12px;
      }
      .eml-row
      {
        min-height: 43px;
        display: flex;
        align-items: center;
        gap: 12px;
        border-bottom: 1px solid #252d40;
      }
      .eml-row:last-child
      {
        border-bottom: 0;
      }
      .eml-label
      {
        flex: 1;
        min-width: 80px;
      }
      .eml-hint
      {
        display: block;
        margin-top: 2px;
        color: #7f8ba8;
        font-size: 11px;
      }
      button.eml-action
      {
        padding: 7px 11px;
        color: #eff4ff;
        background: #5269d8;
        border: 1px solid #6d82e5;
        border-radius: 7px;
        cursor: pointer;
      }
      button.eml-action:hover
      {
        background: #6279e4;
      }
      input[type="number"], input[type="text"], select
      {
        width: 150px;
        padding: 7px 9px;
        color: #edf2ff;
        background: #0f1420;
        border: 1px solid #3b4661;
        border-radius: 7px;
        outline: none;
      }
      input:focus, select:focus
      {
        border-color: #6e83e9;
        box-shadow: 0 0 0 2px rgba(90, 111, 220, .22);
      }
      .eml-switch
      {
        position: relative;
        width: 42px;
        height: 24px;
        flex: 0 0 auto;
      }
      .eml-switch input
      {
        position: absolute;
        opacity: 0;
      }
      .eml-slider
      {
        position: absolute;
        inset: 0;
        background: #333d55;
        border-radius: 99px;
        cursor: pointer;
        transition: .15s;
      }
      .eml-slider::after
      {
        content: '';
        position: absolute;
        width: 18px;
        height: 18px;
        left: 3px;
        top: 3px;
        background: white;
        border-radius: 50%;
        transition: .15s;
      }
      .eml-switch input:checked + .eml-slider
      {
        background: #5c73df;
      }
      .eml-switch input:checked + .eml-slider::after
      {
        transform: translateX(18px);
      }
      .eml-section
      {
        padding: 9px 0 4px;
        color: #8fa2d8;
        font-size: 11px;
        font-weight: 750;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      .eml-footer
      {
        display: flex;
        gap: 9px;
        padding: 9px 14px;
        color: #8290ad;
        border-top: 1px solid #30394f;
        font-size: 11px;
      }
      .eml-toastbox
      {
        position: fixed;
        right: 18px;
        bottom: 18px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        pointer-events: none;
      }
      .eml-toast
      {
        max-width: 360px;
        padding: 10px 12px;
        color: #edf2ff;
        background: #20283a;
        border: 1px solid #46516c;
        border-radius: 8px;
        box-shadow: 0 8px 30px rgba(0,0,0,.4);
        animation: eml-in .15s ease-out;
      }
      .eml-toast.error
      {
        border-color: #a24f5e;
        background: #3a2028;
      }
      @keyframes eml-in
      {
        from
        {
          opacity: 0;
          transform: translateY(8px);
        }
      }
    `;

    const panel = element( 'section', 'eml-panel' );

    const header = element( 'header', 'eml-header' );
    header.append( element( 'span', 'eml-brand', 'EMods' ) );
    header.append( element( 'span', 'eml-version', `v${FRAMEWORK_VERSION}` ) );
    header.append( element( 'span', 'eml-spacer' ) );
    header.append( element( 'kbd', 'eml-key', 'F1' ) );

    const close = element('button', 'eml-close', 'x' );
    close.type = 'button';
    close.title = 'Close';
    close.addEventListener( 'click', () => setVisible(false) );

    header.append(close);

    const content = element( 'main', 'eml-content' );
    const footer = element( 'footer', 'eml-footer' );
    const status = element( 'span', '', 'Loading mods…' );
    footer.append( status);
    footer.append( element( 'span', 'eml-spacer' ) );
    footer.append( element( 'span', '', 'CDP-Injection Tool. Under GNU v3.0' ) );

    const toastBox = element( 'div', 'eml-toastbox' );

    panel.append( header, content, footer );

    shadow.append( style, panel, toastBox );

    document.documentElement.append(host);

    state.host = host;
    state.shadow = shadow;
    state.panel = panel;
    state.content = content;
    state.status = status;

    render();

    while (pendingControls.length)
    {
      pendingControls.shift() ();
    }
  }

  function setVisible(value)
  {
    state.visible = Boolean(value);
    state.panel?.classList.toggle( 'open', state.visible );
  }

  function toast(message, type = 'info', duration = 2800)
  {
    const show = () =>
    {
      const box = state.shadow?.querySelector( '.eml-toastbox' );
      if (!box)
      {
        return;
      }

      const item = element( 'div', `eml-toast ${type === 'error' ? 'error' : ''}`, String(message) );
      
      box.append(item);
      
      setTimeout( () => item.remove(), duration );
    };
    
    if (state.ready)
    {
      show();
    }
    else
    {
      pendingControls.push( show );
    }

  }

  function render()
  {
    if (!state.content)
    {
      return;
    }

    state.content.replaceChildren();

    const registered = [ ...mods.values() ];

    state.status.textContent = `${registered.length} mod${registered.length === 1 ? '' : 's'} loaded`;

    if ( !registered.length )
    {
      state.content.append( element( 'div', 'eml-empty', 'No mods are loaded. Add .js files to the mods directory and restart the game.' ) );
      return;
    }

    for ( const mod of registered )
    {
      const card = element( 'section', 'eml-mod' );
      const head = element( 'header', 'eml-mod-head' );

      head.append( element( 'span', 'eml-mod-name', mod.name ) );

      if (mod.version)
      {
        head.append( element( 'span', 'eml-mod-version', mod.version ) );
      }
      
      if (mod.description)
      {
        head.append( element( 'span', 'eml-mod-description', mod.description ) );
      }

      const controls = element( 'div', 'eml-controls' );

      for (const control of mod.controls)
      {
        controls.append(renderControl(mod, control));
      }

      if (!mod.controls.length)
      {
        controls.append( element( 'div', 'eml-row', 'This mod has no menu controls.' ) );
      }

      card.append( head, controls );

      state.content.append(card);
    }
  }

  function renderControl(mod, control)
  {
    if (control.kind === 'section')
    {
      return element( 'div', 'eml-section', control.label );
    }

    const row = element( 'div', 'eml-row' );

    const label = element( 'label', 'eml-label', control.label );

    if (control.hint)
    {
      label.append( element( 'span', 'eml-hint', control.hint ) );
    }

    row.append(label);

    if ( control.kind === 'button' )
    {
      const button = element( 'button', 'eml-action', control.buttonText || 'Run' );
      button.type = 'button';

      button.addEventListener( 'click', () => safeCall(`${mod.name}: ${control.label}`, control.onClick ) );

      row.append(button);
    }
    else if ( control.kind === 'toggle' )
    {
      const wrapper = element( 'label', 'eml-switch' );
      const input = element( 'input' );
      input.type = 'checkbox';
      input.checked = Boolean( control.value );

      const slider = element( 'span', 'eml-slider' );
      
      input.addEventListener('change', () =>
        {
          control.value = input.checked;
          safeCall(`${mod.name}: ${control.label}`, control.onChange, input.checked);
        }
      );

      wrapper.append( input, slider );

      row.append(wrapper);

    }
    else if ( control.kind === 'number' )
    {
      const input = element( 'input' );
      input.type = 'number';
      input.value = String( control.value ?? 0 );

      if ( control.min !== undefined )
      {
        input.min = String( control.min );
      }

      if ( control.max !== undefined )
      {
        input.max = String( control.max );
      }

      if ( control.step !== undefined)
      {
        input.step = String(control.step);
      }

      input.addEventListener('change', () =>
        {
          control.value = input.valueAsNumber;
          safeCall(`${mod.name}: ${control.label}`, control.onChange, input.valueAsNumber);
        }
      );

      row.append(input);

    }
    else if ( control.kind === 'text' )
    {
      const input = element('input');
      input.type = 'text';
      input.value = String( control.value ?? '' );
      input.placeholder = control.placeholder || '';

      input.addEventListener('change', () =>
        {
          control.value = input.value;
          safeCall(`${mod.name}: ${control.label}`, control.onChange, input.value);
        }
      );

      row.append(input);
    }

    return row;
  }

  function addControl(mod, control)
  {
    mod.controls.push(control);

    render();

    return {
      set(value)
      {
        control.value = value;
        render();
      },

      get()
      {
        return control.value;
      },

      remove()
      {
        const index = mod.controls.indexOf(control);
        if (index !== -1)
        {
          mod.controls.splice(index, 1);
        }

        render();

      }

    };

  }

  function createApi(mod)
  {
    const cleanups = mod.cleanups;
    
    const storagePrefix = `electron-mod-loader:${mod.id}:`;
    
    return Object.freeze(
      {
        window: globalThis,
        document,
        toast,
        log: (...values) => console.log( `[${mod.name}]`, ...values ),
        
        waitFor(test, options = {})
        {
          const timeout = options.timeout ?? 15000;
          const interval = options.interval ?? 50;

          return new Promise( (resolve, reject) =>
            {
              const started = Date.now();
              const timer = setInterval( () =>
                {
                  let value;
                  try
                  {
                    value = test();
                  }
                  catch
                  {
                    value = null;
                  }

                  if (value)
                  {
                    clearInterval(timer);
                    resolve(value);
                  }
                  else if ( Date.now() - started >= timeout )
                  {
                    clearInterval(timer);
                    reject( new Error(`Timed out after ${timeout}ms`) );
                  }
                },
                interval
              );
            }
          );
        },

        patch(object, key, wrapper)
        {
          if (!object)
          {
            throw new TypeError('patch() requires an object');
          }

          const original = object[key];

          if ( typeof original !== 'function' )
          {
            throw new TypeError(`${String(key)} is not a function`);
          }

          const replacement = wrapper( original.bind(object) );

          if ( typeof replacement !== 'function' )
          {
            throw new TypeError('Patch wrapper must return a function');
          }

          object[key] = replacement;

          const undo = () =>
          {
            if ( object[key] === replacement )
            {
              object[key] = original;
            }
          };

          cleanups.push(undo);

          return undo;
        },

        onCleanup(callback)
        {
          cleanups.push(callback);
        },

        storage: Object.freeze(
          {
            get(key, fallback = null)
            {
              try
              {
                const value = localStorage.getItem( storagePrefix + key );
                
                return value === null ? fallback : JSON.parse(value);

              }
              catch
              {
                return fallback;
              }
            },
            
            set(key, value)
            {
              localStorage.setItem( storagePrefix + key, JSON.stringify(value) );
            },
            remove(key)
            {
              localStorage.removeItem( storagePrefix + key );
            }
          }
        ),

        menu: Object.freeze(
          {
            section: label => addControl( mod, { kind: 'section', label: String(label) } ),

            button: (label, onClick, options = {}) => addControl( mod, { kind: 'button', label: String(label), onClick, ...options } ),

            toggle: (label, value, onChange, options = {}) => addControl( mod, { kind: 'toggle', label: String(label), value, onChange, ...options } ),

            number: (label, value, onChange, options = {}) => addControl( mod, { kind: 'number', label: String(label), value, onChange, ...options } ),

            text: (label, value, onChange, options = {}) => addControl( mod, { kind: 'text', label: String(label), value, onChange, ...options } ),

            show: () => setVisible(true),
            hide: () => setVisible(false),
            toggleVisible: () => setVisible( !state.visible )
          }
        )
      }
    );
  }

  function register(definition)
  {
    if ( !definition || typeof definition !== 'object' )
    {
      throw new TypeError('register() requires a mod definition');
    }

    const id = String( definition.id || '' ).trim();
    
    if ( !/^[a-z0-9][a-z0-9._-]*$/i.test(id) )
    {
      throw new Error(`Invalid mod id: ${id || '(empty)'}`);
    }

    if ( mods.has(id) )
    {
      log( `Skipping duplicate mod id: ${id}` );
      
      return mods.get(id).api;
    }

    const mod =
    {
      id,
      name: String( definition.name || id ),
      version: definition.version ? String( definition.version ) : '',
      description: definition.description ? String( definition.description ) : '',
      controls: [],
      cleanups: [],
      api: null
    };

    mod.api = createApi(mod);
    
    mods.set( id, mod );

    render();

    if ( typeof definition.init === 'function' )
    {
      safeCall(`${mod.name} initialization`, definition.init, mod.api);
    }

    log( `Loaded ${mod.name}${mod.version ? ` v${mod.version}` : ''}` );
    
    return mod.api;
  }

  globalThis.ElectronMods = Object.freeze(
    {
      frameworkVersion: FRAMEWORK_VERSION,
      register,
      toast,
      show: () => setVisible(true),
      hide: () => setVisible(false),
      toggle: () => setVisible( !state.visible ),

      getMods: () => [ ...mods.values() ] .map( ( { id, name, version, description } ) => ( { id, name, version, description } ) ),
      
      __load(fileName, callback)
      {
        if ( loadedFiles.has( fileName ) )
        {
          return;
        }

        loadedFiles.add(fileName);

        safeCall( `Loading ${fileName}`, callback );
      },

      __finishLoading()
      {
        if ( state.status )
        {
          state.status.textContent = `${mods.size} mod${ mods.size === 1 ? '' : 's' } loaded`;
        }
      }
    }

  );

  addEventListener(
    'keydown',
    event =>
    {
      if ( event.key !== 'F1' || event.repeat )
      {
        return;
      }

      event.preventDefault();

      event.stopImmediatePropagation();

      setVisible( !state.visible );
    },
    true
  );

  addEventListener(
    'beforeunload',
    () =>
    {
      for ( const mod of mods.values() )
        {
          for ( const cleanup of mod.cleanups.reverse() )
          {
            safeCall(`${mod.name} cleanup`, cleanup);
          }
        }
    },
    { once: true }
  );

  if ( document.readyState === 'loading' )
  {
    document.addEventListener( 'DOMContentLoaded', mount, { once: true } );
  }
  else
  {
    mount();
  }

  log( `Framework v${FRAMEWORK_VERSION} initialized` );
}

) ();
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
ElectronMods.register(
  {
    id: 'example.menu',
    name: 'Example Mod',
    version: '1.0.0',
    description: 'Demonstrates every built-in menu control.',

    init(api)
    {
      api.menu.section( 'Actions' );

      api.menu.button(
        'Show a notification',
        () =>
        {
          api.toast('Hello from the example mod.');
        },
        {
          buttonText: 'Show'
        }
      );

      api.menu.section( 'Values' );

      api.menu.toggle(
        'Enabled',
        false,
        enabled =>
        {
          api.log('Enabled:', enabled);
        },
        {
          hint: 'Toggle controls call onChange immediately after user input.'
        }
      );

      api.menu.number(
        'Multiplier',
        2,
        value =>
        {
          api.storage.set('multiplier', value);
        },
        {
          min: 0,
          max: 100,
          step: 0.5
        }
      );

      api.menu.text(
        'Player name',
        '',
        value => 
        {
          api.log('Player name:', value);
        },
        {
          placeholder: 'Type a value'
        }
      );
    }
  }
);
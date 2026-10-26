namespace ElectronModLoader;

internal sealed class LoaderOptions
{
  public string? GamePath { get; private set; }

  public string ModsDirectory { get; private set; } = Path.Combine( AppContext.BaseDirectory, "mods" );

  public int? Port { get; private set; }

  public int? AttachPort { get; private set; }
  public bool ShowHelp { get; private set; }
  public List<string> GameArguments { get; } = [];

  public static LoaderOptions Parse(string[] args)
  {
    var result = new LoaderOptions();

    for (var index = 0; index < args.Length; index++)
    {
      var argument = args[ index ];

      switch (argument)
      {
      case "-h" or "--help":
        result.ShowHelp = true;
        break;

      case "-g" or "--game":
        result.GamePath = RequireValue( args, ref index, argument );
        break;

      case "-m" or "--mods":
        result.ModsDirectory = RequireValue( args, ref index, argument );
        break;

      case "-p" or "--port":
        result.Port = ParsePort( RequireValue( args, ref index, argument ), argument );
        break;

      case "--attach":
        result.AttachPort = ParsePort( RequireValue( args, ref index, argument ), argument );
        break;

      case "--":
        result.GameArguments.AddRange( args[ (index + 1).. ] );
        index = args.Length;
        break;

      default:
        if ( !argument.StartsWith( '-' ) && result.GamePath is null )
        {
          result.GamePath = argument;
        }
        else
        {
          throw new ArgumentException( $"Unknown argument: { argument }" );
        }

        break;
      }

    }

    if ( !result.ShowHelp && result.AttachPort is null && string.IsNullOrWhiteSpace( result.GamePath ) )
    {
      throw new ArgumentException( "Provide a exe with --game or use --attach PORT");
    }

    if ( result.AttachPort is not null && result.GamePath is not null )
    {
      throw new ArgumentException( "--attach and --game dont combine");
    }

    return result;
  }

  public static void PrintHelp()
  {
    Console.WriteLine("""
      ElectronModLoader - runtime mod injection tool for Electron apps

      Usage:
        ElectronModLoader.exe --game <game.exe> [--mods <directory>] [--port <port>] [-- <game args>]
        ElectronModLoader.exe <game.exe> [--mods <directory>]
        ElectronModLoader.exe --attach <port> [--mods <directory>]

      Options:
        -g, --game PATH    Electron executable to launch
        -m, --mods PATH    Directory containing .js mods (default: beside the loader)
        -p, --port PORT    Fixed local CDP port (default: choose a free port)
            --attach PORT  Attach to an app already launched with --remote-debugging-port
        -h, --help         Show this help

      Files beginning with '_' are ignored. The in-game menu hotkey is F1
      """);
  }

  private static string RequireValue(string[] args, ref int index, string option)
  {
    if ( ++index >= args.Length )
    {
      throw new ArgumentException( $"{option} requires a value" );
    }

    return args[index];
  }

  private static int ParsePort(string value, string option)
  {
    if ( !int.TryParse( value, out var port ) || port is < 1 or > 65535 )
    {
      throw new ArgumentException( $"{option} requires a port from 1 to 65535" );
    }

    return port;
  }
}

using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Text.Json;

namespace ElectronModLoader;

internal static class Program
{
  private static readonly HttpClient Http = new(
    new SocketsHttpHandler
    {
      UseProxy = false
    }
  )

  {
    Timeout = TimeSpan.FromSeconds(2)
  };

  public static async Task<int> Main(string[] args)
  {
    Console.OutputEncoding = Encoding.UTF8;

    LoaderOptions options;

    try
    {
      options = LoaderOptions.Parse( args );
    }
    catch ( ArgumentException error )
    {
      Console.Error.WriteLine( $"Error: {error.Message}\n" );
      
      LoaderOptions.PrintHelp();
      
      return 2;
    }

    if ( options.ShowHelp )
    {
      LoaderOptions.PrintHelp();
      return 0;
    }

    var modsDirectory = Path.GetFullPath( options.ModsDirectory );
    
    Directory.CreateDirectory( modsDirectory );

    string payload;

    try
    {
      payload = BuildPayload( modsDirectory );
    }
    catch ( Exception error )
    {
      Console.Error.WriteLine( $"Couldnt prepare mods: {error.Message}" );
      return 1;
    }

    Process? game = null;
    var port = options.Port ?? FindAvailablePort();

    if ( options.AttachPort is not null )
    {
      port = options.AttachPort.Value;
      Console.WriteLine( $"Attaching to Electron on 127.0.0.1:{port}" );
    }
    else
    {
      var gamePath = Path.GetFullPath( options.GamePath! );
      
      if ( !File.Exists( gamePath ) )
      {
        Console.Error.WriteLine( $"Game exe not found: {gamePath}" );
        return 1;
      }

      var startInfo = new ProcessStartInfo
      {
        FileName = gamePath,
        WorkingDirectory = Path.GetDirectoryName( gamePath )!,
        UseShellExecute = false
      };

      startInfo.ArgumentList.Add( $"--remote-debugging-port={port}" );
      
      foreach (var argument in options.GameArguments)
      {
        startInfo.ArgumentList.Add( argument );
      }

      Console.WriteLine( $"Starting { Path.GetFileName( gamePath ) } (local dbg endpoint)" );
      
      game = Process.Start( startInfo );

      if ( game is null )
      {
        Console.Error.WriteLine( "The process failed to start" );
        return 1;
      }

    }

    Console.WriteLine( $"Mods directory: { modsDirectory }" );
    
    Console.WriteLine( "The overlay hotkey is F1. Press Ctrl+C here to detach" );

    using var cancellation = new CancellationTokenSource();

    Console.CancelKeyPress += ( _, eventArgs ) =>
    {
      eventArgs.Cancel = true;
      cancellation.Cancel();
    };

    var sessions = new Dictionary< string, CdpSession >();

    var endpoint = $"http://127.0.0.1:{port}";

    var endpointWasSeen = false;
    var connectionWarningShown = false;
    var connectionStarted = Stopwatch.StartNew();

    try
    {
      while ( !cancellation.IsCancellationRequested )
      {
        if ( game is not null && game.HasExited )
        {
          if ( !endpointWasSeen )
          {
            Console.Error.WriteLine( "Game exited before exposing a renderer. Close game instance(s), try again");
            return 1;
          }

          break;
        }

        IReadOnlyList< CdpTarget > targets;

        try
        {
          targets = await DiscoverTargets( endpoint, cancellation.Token );
          endpointWasSeen = true;
        }
        catch when ( !cancellation.IsCancellationRequested )
        {
          if ( !connectionWarningShown && connectionStarted.Elapsed >= TimeSpan.FromSeconds(10) )
          {
            connectionWarningShown = true;
            Console.Error.WriteLine( "Still waiting for Electron's debugging endpoint. " + "The app may still be starting/running/block remote debugging");
          }

          await Task.Delay( 250, cancellation.Token );
          
          continue;
        }

        foreach (var stale in sessions.Where( pair => pair.Value.IsClosed ) .Select( pair => pair.Key ) .ToArray() )
        {
          await sessions[stale].DisposeAsync();

          sessions.Remove(stale);
        }

        foreach (var target in targets.Where( target => target.Type == "page" && target.WebSocketDebuggerUrl is not null && !target.Url.StartsWith( "devtools://", StringComparison.OrdinalIgnoreCase ) ))
        {
          if ( sessions.ContainsKey( target.Id ) )
          {
            continue;
          }

          try
          {
            var session = await CdpSession.ConnectAsync( target.WebSocketDebuggerUrl!, cancellation.Token );
            sessions[ target.Id ] = session;

            await session.SendAsync( "Page.enable", null, cancellation.Token );

            await session.SendAsync( "Page.addScriptToEvaluateOnNewDocument", new { source = payload }, cancellation.Token );

            var evaluation = await session.SendAsync("Runtime.evaluate", new { expression = payload , awaitPromise = true , returnByValue = true }, cancellation.Token );

            if ( evaluation.TryGetProperty( "exceptionDetails", out var exception ) )
            {
              throw new InvalidOperationException( $"Injected JS failed: {exception}" );
            }

            Console.WriteLine($"Injected { target.Title } [{ target.Id[ ..Math.Min( 8, target.Id.Length ) ] }]");
          }
          catch ( Exception error )
          {
            Console.Error.WriteLine( $"Couldnt inject { target.Title }: { error.Message }");

            if ( sessions.Remove( target.Id, out var failedSession ) )
            {
              await failedSession.DisposeAsync();
            }
          }

        }

        await Task.Delay( 750, cancellation.Token );
      }
    }
    catch ( OperationCanceledException )
    {
      // normal Ctrl+C shutdown
    }

    finally
    {
      foreach (var session in sessions.Values)
      {
        await session.DisposeAsync();
      }
    }

    return 0;
}

  private static int FindAvailablePort()
  {
    var listener = new TcpListener( IPAddress.Loopback, 0 );

    listener.Start();

    var port = ( (IPEndPoint)listener.LocalEndpoint ).Port;
    
    listener.Stop();

    return port;
  }

  private static string BuildPayload(string modsDirectory)
  {
    var assembly = Assembly.GetExecutingAssembly();

    var resourceName = assembly.GetManifestResourceNames() .Single( name => name.EndsWith( "assets.framework.js", StringComparison.Ordinal ) );

    using var stream = assembly.GetManifestResourceStream( resourceName ) ?? throw new InvalidOperationException( "Embedded framework.js not found" );
    
    using var reader = new StreamReader( stream, Encoding.UTF8 );

    var payload = new StringBuilder( reader.ReadToEnd() );

    var mods = Directory.EnumerateFiles( modsDirectory, "*.js", SearchOption.TopDirectoryOnly )
      .Where( path => !Path.GetFileName( path ).StartsWith( '_' ) )
      .OrderBy( path => path, StringComparer.OrdinalIgnoreCase )
      .ToArray();

    foreach (var modPath in mods)
    {
      var fileName = Path.GetFileName( modPath );
      payload.AppendLine();

      payload.Append( "ElectronMods.__load(" );

      payload.Append( JsonSerializer.Serialize( fileName ) );
      
      payload.Append( ", () =>\n{\n" );

      payload.Append( File.ReadAllText( modPath, Encoding.UTF8 ) );
      
      payload.AppendLine( "\n}\n);" );
    }

    payload.AppendLine();
    
    payload.AppendLine( "ElectronMods.__finishLoading();" );
    
    Console.WriteLine( $"Prepared {mods.Length} mod(s)." );

    return payload.ToString();
  }

  private static async Task< IReadOnlyList< CdpTarget > > DiscoverTargets(string endpoint, CancellationToken cancellationToken)
  {
    using var response = await Http.GetAsync( $"{ endpoint }/json/list", cancellationToken );

    response.EnsureSuccessStatusCode();

    await using var stream = await response.Content.ReadAsStreamAsync( cancellationToken );

    return await JsonSerializer.DeserializeAsync< List< CdpTarget > >( stream, JsonOptions.Default, cancellationToken ) ?? [];
  }
}

internal sealed record CdpTarget ( string Id, string Type, string Title, string Url, string? WebSocketDebuggerUrl );

internal static class JsonOptions
{
  public static readonly JsonSerializerOptions Default = new() { PropertyNameCaseInsensitive = true };
}
using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace ElectronModLoader;

internal sealed class CdpSession : IAsyncDisposable
{
  private readonly ClientWebSocket _socket = new();

  private readonly ConcurrentDictionary<long, TaskCompletionSource<JsonElement>> _pending = new();

  private readonly CancellationTokenSource _lifetime = new();

  private readonly SemaphoreSlim _sendLock = new(1, 1);

  private Task? _receiveTask;

  private long _nextId;

  public bool IsClosed => _socket.State != WebSocketState.Open;

  public static async Task< CdpSession > ConnectAsync(string endpoint, CancellationToken cancellationToken)
  {
    var session = new CdpSession();

    await session._socket.ConnectAsync( new Uri( endpoint ), cancellationToken );

    session._receiveTask = session.ReceiveLoopAsync( session._lifetime.Token );
    return session;
  }

  public async Task< JsonElement > SendAsync(string method, object? parameters, CancellationToken cancellationToken)
  {
    var id = Interlocked.Increment( ref _nextId );

    var completion = new TaskCompletionSource< JsonElement >( TaskCreationOptions.RunContinuationsAsynchronously );
    
    if ( !_pending.TryAdd( id, completion ) )
    {
      throw new InvalidOperationException( "Couldnt allocate a CDP request ID");
    }

    var message = JsonSerializer.SerializeToUtf8Bytes(new { id , method , @params = parameters } );

    try
    {
      await _sendLock.WaitAsync( cancellationToken );

      try
      {
        await _socket.SendAsync( message, WebSocketMessageType.Text, true, cancellationToken );
      }
      finally
      {
        _sendLock.Release();
      }

      return await completion.Task.WaitAsync( cancellationToken );
    }
    catch
    {
      _pending.TryRemove( id, out _ );
      throw;
    }
  }

  private async Task ReceiveLoopAsync(CancellationToken cancellationToken)
  {
    var buffer = new byte[ 32 * 1024 ];

    try
    {
      while ( !cancellationToken.IsCancellationRequested && _socket.State == WebSocketState.Open )
      {
        using var message = new MemoryStream();

        WebSocketReceiveResult result;

        do
        {
          result = await _socket.ReceiveAsync( buffer, cancellationToken );
          
          if ( result.MessageType == WebSocketMessageType.Close )
          {
            return;
          }

          message.Write( buffer, 0, result.Count );
        }
        while ( !result.EndOfMessage );

        message.Position = 0;

        using var document = await JsonDocument.ParseAsync( message, cancellationToken: cancellationToken );

        var root = document.RootElement;

        if ( !root.TryGetProperty( "id", out var idElement ) || !idElement.TryGetInt64( out var id ) )
        {
          continue;
        }

        if ( !_pending.TryRemove( id, out var completion ) )
        {
          continue;
        }

        if ( root.TryGetProperty( "error", out var error ) )
        {
          completion.TrySetException( new InvalidOperationException( error.ToString() ) );
        }
        else if ( root.TryGetProperty( "result", out var value ) )
        {
          completion.TrySetResult( value.Clone() );
        }
        else
        {
          completion.TrySetResult( default );
        }
      }
    }
    catch ( OperationCanceledException )
    {
      // shutdown
    }
    catch ( Exception error )
    {
      FailPending( error );
    }
    finally
    {
      FailPending( new IOException( "CDP connection closed") );
    }
  }

  private void FailPending(Exception error)
  {
    foreach (var id in _pending.Keys)
    {
      if ( _pending.TryRemove( id, out var completion ) )
      {
        completion.TrySetException( error );
      }
    }
  }

  public async ValueTask DisposeAsync()
  {
    _lifetime.Cancel();

    if ( _socket.State == WebSocketState.Open )
    {
      try
      {
        await _socket.CloseAsync( WebSocketCloseStatus.NormalClosure, "Loader detached", CancellationToken.None );
      }
      catch
      {
        _socket.Abort();
      }
    }

    if ( _receiveTask is not null )
    {
      try
      {
        await _receiveTask;
      }
      catch
      {
        // already surfaced to pending commands
      }
    }

    _socket.Dispose();

    _lifetime.Dispose();

    _sendLock.Dispose();

  }

}
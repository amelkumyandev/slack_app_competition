namespace SlackApp.Modules.Rooms.Services;

public sealed class RoomServiceResult<T>
{
    private RoomServiceResult(T? value, RoomServiceError? error)
    {
        Value = value;
        Error = error;
    }

    public T? Value { get; }

    public RoomServiceError? Error { get; }

    public bool Succeeded => Error is null;

    public static RoomServiceResult<T> Success(T value)
    {
        return new RoomServiceResult<T>(value, null);
    }

    public static RoomServiceResult<T> Failure(string code, string message, int statusCode)
    {
        return new RoomServiceResult<T>(default, new RoomServiceError(code, message, statusCode));
    }
}

public sealed record RoomServiceError(string Code, string Message, int StatusCode);

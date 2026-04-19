namespace SlackApp.Modules.Sessions.Services;

public sealed class SessionServiceResult<T>
{
    private SessionServiceResult(T? value, SessionServiceError? error)
    {
        Value = value;
        Error = error;
    }

    public T? Value { get; }

    public SessionServiceError? Error { get; }

    public bool Succeeded => Error is null;

    public static SessionServiceResult<T> Success(T value)
    {
        return new SessionServiceResult<T>(value, null);
    }

    public static SessionServiceResult<T> Failure(string code, string message, int statusCode)
    {
        return new SessionServiceResult<T>(default, new SessionServiceError(code, message, statusCode));
    }
}

public sealed record SessionServiceError(string Code, string Message, int StatusCode);

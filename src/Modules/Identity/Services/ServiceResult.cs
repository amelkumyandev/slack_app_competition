namespace SlackApp.Modules.Identity.Services;

public sealed record ServiceError(string Code, string Message, int StatusCode);

public sealed class ServiceResult<T>
{
    private ServiceResult(T? value, ServiceError? error)
    {
        Value = value;
        Error = error;
    }

    public T? Value { get; }

    public ServiceError? Error { get; }

    public bool Succeeded => Error is null;

    public static ServiceResult<T> Success(T value) => new(value, null);

    public static ServiceResult<T> Failure(string code, string message, int statusCode) =>
        new(default, new ServiceError(code, message, statusCode));
}

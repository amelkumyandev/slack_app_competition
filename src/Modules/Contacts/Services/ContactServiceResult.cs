namespace SlackApp.Modules.Contacts.Services;

public sealed class ContactServiceResult<T>
{
    private ContactServiceResult(T? value, ContactServiceError? error)
    {
        Value = value;
        Error = error;
    }

    public T? Value { get; }

    public ContactServiceError? Error { get; }

    public bool Succeeded => Error is null;

    public static ContactServiceResult<T> Success(T value)
    {
        return new ContactServiceResult<T>(value, null);
    }

    public static ContactServiceResult<T> Failure(string code, string message, int statusCode)
    {
        return new ContactServiceResult<T>(default, new ContactServiceError(code, message, statusCode));
    }
}

public sealed record ContactServiceError(string Code, string Message, int StatusCode);

using SlackApp.Modules.Attachments.Extensions;
using SlackApp.Modules.Contacts.Extensions;
using SlackApp.Modules.Identity.Extensions;
using SlackApp.Modules.Messaging.Extensions;
using SlackApp.Modules.Presence.Extensions;
using SlackApp.Modules.Rooms.Extensions;
using SlackApp.Modules.Sessions.Extensions;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddProblemDetails();
builder.Services.AddCors(options =>
{
    options.AddPolicy("web", policy =>
    {
        var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? ["http://localhost:3000"];

        policy
            .SetIsOriginAllowed(origin => IsAllowedWebOrigin(origin, allowedOrigins))
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});
builder.Services.AddIdentityModule(builder.Configuration);
builder.Services.AddSessionsModule();
builder.Services.AddContactsModule();
builder.Services.AddPresenceModule(builder.Configuration);
builder.Services.AddMessagingModule();
builder.Services.AddAttachmentsModule();
builder.Services.AddRoomsModule();

var app = builder.Build();

app.UseExceptionHandler();
app.UseCors("web");
app.UseAuthentication();
app.UseAuthorization();

if (app.Configuration.GetValue("Identity:InitializeOnStartup", true))
{
    await app.Services.InitializeIdentityModuleAsync();
}

var modules = new[]
{
    "Identity",
    "Sessions",
    "Presence",
    "Contacts",
    "Rooms",
    "Messaging",
    "Attachments",
    "Notifications",
    "Administration",
    "XmppBridge"
};

app.MapGet("/", () => Results.Ok(new
{
    application = "Slack App Competition API",
    status = "watermark-sync-ready",
    architecture = "modular-monolith",
    auth = "cookie-session",
    realtime = "signalr-watermarks",
    modules
}));

app.MapGet("/healthz", () => Results.Ok(new { status = "healthy" }));

app.MapGet("/api/meta", () => Results.Ok(new
{
    environment = app.Environment.EnvironmentName,
    services = new
    {
        postgresConfigured = !string.IsNullOrWhiteSpace(app.Configuration.GetConnectionString("Postgres")),
        redisConfigured = !string.IsNullOrWhiteSpace(app.Configuration.GetConnectionString("Redis")),
        presenceStore = app.Configuration["Presence:Store"] ?? "InMemory",
        uploadsRoot = app.Configuration["Storage:UploadsRoot"] ?? "uploads",
        auth = "cookie-session",
        signalrHub = "/hubs/realtime"
    }
}));

app.MapIdentityModule();
app.MapSessionsModule();
app.MapContactsModule();
app.MapPresenceModule();
app.MapMessagingModule();
app.MapAttachmentsModule();
app.MapRoomsModule();

app.Run();

static bool IsAllowedWebOrigin(string origin, string[] configuredOrigins)
{
    if (configuredOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase))
    {
        return true;
    }

    if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri))
    {
        return false;
    }

    return uri.Scheme is "http" or "https" && uri.Host is "localhost" or "127.0.0.1" or "::1";
}

public partial class Program;

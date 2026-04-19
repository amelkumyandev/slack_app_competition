var builder = WebApplication.CreateBuilder(args);

builder.Services.AddProblemDetails();

var app = builder.Build();

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
    status = "scaffold-ready",
    architecture = "modular-monolith",
    realtime = "signalr-planned",
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
        uploadsRoot = app.Configuration["Storage:UploadsRoot"] ?? "uploads"
    }
}));

app.Run();

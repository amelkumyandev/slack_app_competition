using SlackApp.Modules.Identity.Extensions;
using SlackApp.Modules.Sessions.Extensions;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddProblemDetails();
builder.Services.AddCors(options =>
{
    options.AddPolicy("web", policy =>
    {
        var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? ["http://localhost:3000"];

        policy
            .WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});
builder.Services.AddIdentityModule(builder.Configuration);
builder.Services.AddSessionsModule();

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
    status = "session-management-ready",
    architecture = "modular-monolith",
    auth = "cookie-session",
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
        uploadsRoot = app.Configuration["Storage:UploadsRoot"] ?? "uploads",
        auth = "cookie-session"
    }
}));

app.MapIdentityModule();
app.MapSessionsModule();

app.Run();

public partial class Program;

using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using SlackApp.Modules.Identity.Infrastructure;

namespace SlackApp.Api.IntegrationTests;

public sealed class TestWebApplicationFactory : WebApplicationFactory<Program>
{
    private readonly string sqliteDatabasePath = Path.Combine(Path.GetTempPath(), $"slackapp-auth-tests-{Guid.NewGuid():N}.db");
    private readonly string uploadsRootPath = Path.Combine(Path.GetTempPath(), $"slackapp-upload-tests-{Guid.NewGuid():N}");

    public string UploadsRootPath => uploadsRootPath;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.ConfigureAppConfiguration((_, configurationBuilder) =>
        {
            configurationBuilder.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Identity:InitializeOnStartup"] = "false",
                ["Identity:DatabaseProvider"] = "Sqlite",
                ["ConnectionStrings:IdentitySqlite"] = $"Data Source={sqliteDatabasePath}",
                ["Presence:Store"] = "InMemory",
                ["Presence:HeartbeatIntervalSeconds"] = "1",
                ["Presence:HeartbeatTtlSeconds"] = "3",
                ["Presence:AfkThresholdSeconds"] = "1",
                ["Presence:SweepIntervalSeconds"] = "1",
                ["Storage:UploadsRoot"] = uploadsRootPath,
                ["Storage:MaxUploadBytes"] = "65536"
            });
        });

        builder.ConfigureServices(services =>
        {
            var descriptorsToRemove = services
                .Where(descriptor =>
                    descriptor.ServiceType == typeof(IdentityDbContext) ||
                    descriptor.ServiceType == typeof(DbContextOptions<IdentityDbContext>) ||
                    descriptor.ServiceType == typeof(DbContextOptions) ||
                    (descriptor.ServiceType.IsGenericType &&
                     descriptor.ServiceType.GenericTypeArguments.Length == 1 &&
                     descriptor.ServiceType.GenericTypeArguments[0] == typeof(IdentityDbContext) &&
                     descriptor.ServiceType.Name == "IDbContextOptionsConfiguration`1"))
                .ToList();

            foreach (var descriptor in descriptorsToRemove)
            {
                services.Remove(descriptor);
            }

            services.AddDbContext<IdentityDbContext>(options =>
            {
                options.UseSqlite($"Data Source={sqliteDatabasePath}");
            });
        });
    }

    protected override IHost CreateHost(IHostBuilder builder)
    {
        var host = base.CreateHost(builder);

        using var scope = host.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();
        dbContext.Database.EnsureCreated();

        return host;
    }

    public override async ValueTask DisposeAsync()
    {
        try
        {
            if (File.Exists(sqliteDatabasePath))
            {
                try
                {
                    File.Delete(sqliteDatabasePath);
                }
                catch (IOException)
                {
                    // The temp database is best-effort cleanup only.
                }
            }

            if (Directory.Exists(uploadsRootPath))
            {
                try
                {
                    Directory.Delete(uploadsRootPath, recursive: true);
                }
                catch (IOException)
                {
                    // The temp uploads directory is best-effort cleanup only.
                }
            }
        }
        finally
        {
            await base.DisposeAsync();
        }
    }
}

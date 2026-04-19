using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using SlackApp.Modules.Identity.Domain;
using SlackApp.Modules.Identity.Services;

namespace SlackApp.Modules.Identity.Infrastructure;

public static class IdentityModuleServiceCollectionExtensions
{
    public static IServiceCollection AddIdentityModuleServices(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<IdentityModuleOptions>(configuration.GetSection(IdentityModuleOptions.SectionName));
        services.AddSingleton(sp => sp.GetRequiredService<IOptions<IdentityModuleOptions>>().Value);
        services.AddSingleton(TimeProvider.System);
        services.AddSingleton<PasswordResetTokenService>();
        services.AddScoped<IPasswordHasher<UserAccount>, PasswordHasher<UserAccount>>();
        services.AddScoped<AuthService>();
        services.AddScoped<IdentityCookieEvents>();

        var moduleOptions = configuration.GetSection(IdentityModuleOptions.SectionName).Get<IdentityModuleOptions>() ?? new IdentityModuleOptions();

        services.AddDbContext<IdentityDbContext>((serviceProvider, options) =>
        {
            var provider = moduleOptions.DatabaseProvider.Trim().ToUpperInvariant();

            if (provider == "SQLITE")
            {
                var sqliteConnectionString = configuration.GetConnectionString("IdentitySqlite");

                if (string.IsNullOrWhiteSpace(sqliteConnectionString))
                {
                    throw new InvalidOperationException("ConnectionStrings:IdentitySqlite must be configured when Identity:DatabaseProvider is Sqlite.");
                }

                options.UseSqlite(sqliteConnectionString);
                return;
            }

            var postgresConnectionString = configuration.GetConnectionString("Postgres");

            if (string.IsNullOrWhiteSpace(postgresConnectionString))
            {
                throw new InvalidOperationException("ConnectionStrings:Postgres must be configured for the identity module.");
            }

            options.UseNpgsql(postgresConnectionString, npgsqlOptions =>
            {
                npgsqlOptions.UseQuerySplittingBehavior(QuerySplittingBehavior.SingleQuery);
            });
        });

        services
            .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
            .AddCookie(options =>
            {
                options.Cookie.Name = moduleOptions.CookieName;
                options.Cookie.HttpOnly = true;
                options.Cookie.SameSite = SameSiteMode.Lax;
                options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
                options.SlidingExpiration = true;
                options.ExpireTimeSpan = moduleOptions.PersistentSessionLifetime;
                options.EventsType = typeof(IdentityCookieEvents);
            });

        services.AddAuthorization();

        return services;
    }
}

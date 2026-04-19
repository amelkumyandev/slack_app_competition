using Microsoft.EntityFrameworkCore;
using SlackApp.Modules.Identity.Domain;

namespace SlackApp.Modules.Identity.Infrastructure;

public sealed class IdentityDbContext(DbContextOptions<IdentityDbContext> options) : DbContext(options)
{
    public DbSet<UserAccount> UserAccounts => Set<UserAccount>();

    public DbSet<UserSession> UserSessions => Set<UserSession>();

    public DbSet<PasswordResetTokenRecord> PasswordResetTokens => Set<PasswordResetTokenRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var userAccounts = modelBuilder.Entity<UserAccount>();
        userAccounts.ToTable("user_accounts");
        userAccounts.HasKey(account => account.Id);
        userAccounts.Property(account => account.Email).HasMaxLength(320).IsRequired();
        userAccounts.Property(account => account.NormalizedEmail).HasMaxLength(320).IsRequired();
        userAccounts.Property(account => account.UserName).HasMaxLength(64).IsRequired();
        userAccounts.Property(account => account.NormalizedUserName).HasMaxLength(64).IsRequired();
        userAccounts.Property(account => account.PasswordHash).HasMaxLength(512).IsRequired();
        userAccounts.HasIndex(account => account.NormalizedEmail).IsUnique();
        userAccounts.HasIndex(account => account.NormalizedUserName).IsUnique();

        var sessions = modelBuilder.Entity<UserSession>();
        sessions.ToTable("user_sessions");
        sessions.HasKey(session => session.Id);
        sessions.Property(session => session.UserAgent).HasMaxLength(512);
        sessions.Property(session => session.IpAddress).HasMaxLength(64);
        sessions.HasOne(session => session.User)
            .WithMany(account => account.Sessions)
            .HasForeignKey(session => session.UserAccountId)
            .OnDelete(DeleteBehavior.Cascade);
        sessions.HasIndex(session => new { session.UserAccountId, session.RevokedAtUtc });

        var resetTokens = modelBuilder.Entity<PasswordResetTokenRecord>();
        resetTokens.ToTable("password_reset_tokens");
        resetTokens.HasKey(token => token.Id);
        resetTokens.Property(token => token.TokenHash).HasMaxLength(128).IsRequired();
        resetTokens.HasOne(token => token.User)
            .WithMany(account => account.PasswordResetTokens)
            .HasForeignKey(token => token.UserAccountId)
            .OnDelete(DeleteBehavior.Cascade);
        resetTokens.HasIndex(token => token.TokenHash).IsUnique();
    }
}

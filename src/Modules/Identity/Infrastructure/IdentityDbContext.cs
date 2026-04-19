using Microsoft.EntityFrameworkCore;
using SlackApp.Modules.Identity.Domain;

namespace SlackApp.Modules.Identity.Infrastructure;

public sealed class IdentityDbContext(DbContextOptions<IdentityDbContext> options) : DbContext(options)
{
    public DbSet<UserAccount> UserAccounts => Set<UserAccount>();

    public DbSet<UserSession> UserSessions => Set<UserSession>();

    public DbSet<PasswordResetTokenRecord> PasswordResetTokens => Set<PasswordResetTokenRecord>();

    public DbSet<FriendRequest> FriendRequests => Set<FriendRequest>();

    public DbSet<Friendship> Friendships => Set<Friendship>();

    public DbSet<UserBan> UserBans => Set<UserBan>();

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

        var friendRequests = modelBuilder.Entity<FriendRequest>();
        friendRequests.ToTable("friend_requests");
        friendRequests.HasKey(request => request.Id);
        friendRequests.HasOne<UserAccount>()
            .WithMany()
            .HasForeignKey(request => request.RequesterUserId)
            .OnDelete(DeleteBehavior.Cascade);
        friendRequests.HasOne<UserAccount>()
            .WithMany()
            .HasForeignKey(request => request.AddresseeUserId)
            .OnDelete(DeleteBehavior.Cascade);
        friendRequests.HasIndex(request => new { request.RequesterUserId, request.Status });
        friendRequests.HasIndex(request => new { request.AddresseeUserId, request.Status });
        friendRequests.HasIndex(request => new { request.RequesterUserId, request.AddresseeUserId, request.Status });

        var friendships = modelBuilder.Entity<Friendship>();
        friendships.ToTable("friendships");
        friendships.HasKey(friendship => friendship.Id);
        friendships.HasOne<UserAccount>()
            .WithMany()
            .HasForeignKey(friendship => friendship.FirstUserId)
            .OnDelete(DeleteBehavior.Cascade);
        friendships.HasOne<UserAccount>()
            .WithMany()
            .HasForeignKey(friendship => friendship.SecondUserId)
            .OnDelete(DeleteBehavior.Cascade);
        friendships.HasIndex(friendship => new { friendship.FirstUserId, friendship.SecondUserId }).IsUnique();

        var userBans = modelBuilder.Entity<UserBan>();
        userBans.ToTable("user_bans");
        userBans.HasKey(userBan => userBan.Id);
        userBans.Property(userBan => userBan.Reason).HasMaxLength(512);
        userBans.HasOne<UserAccount>()
            .WithMany()
            .HasForeignKey(userBan => userBan.SourceUserId)
            .OnDelete(DeleteBehavior.Cascade);
        userBans.HasOne<UserAccount>()
            .WithMany()
            .HasForeignKey(userBan => userBan.TargetUserId)
            .OnDelete(DeleteBehavior.Cascade);
        userBans.HasIndex(userBan => new { userBan.SourceUserId, userBan.TargetUserId }).IsUnique();
    }
}

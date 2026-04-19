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

    public DbSet<Room> Rooms => Set<Room>();

    public DbSet<Conversation> Conversations => Set<Conversation>();

    public DbSet<ConversationMessage> ConversationMessages => Set<ConversationMessage>();

    public DbSet<ConversationReadState> ConversationReadStates => Set<ConversationReadState>();

    public DbSet<MessageAttachment> MessageAttachments => Set<MessageAttachment>();

    public DbSet<RoomMember> RoomMembers => Set<RoomMember>();

    public DbSet<RoomAdmin> RoomAdmins => Set<RoomAdmin>();

    public DbSet<RoomInvitation> RoomInvitations => Set<RoomInvitation>();

    public DbSet<RoomBan> RoomBans => Set<RoomBan>();

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

        var rooms = modelBuilder.Entity<Room>();
        rooms.ToTable("rooms");
        rooms.HasKey(room => room.Id);
        rooms.Property(room => room.ConversationId).IsRequired();
        rooms.Property(room => room.Name).HasMaxLength(64).IsRequired();
        rooms.Property(room => room.NormalizedName).HasMaxLength(64).IsRequired();
        rooms.Property(room => room.Description).HasMaxLength(512);
        rooms.HasOne<UserAccount>()
            .WithMany()
            .HasForeignKey(room => room.OwnerUserId)
            .OnDelete(DeleteBehavior.Cascade);
        rooms.HasIndex(room => room.NormalizedName).IsUnique();
        rooms.HasIndex(room => room.ConversationId).IsUnique();
        rooms.HasIndex(room => room.Visibility);

        var conversations = modelBuilder.Entity<Conversation>();
        conversations.ToTable("conversations");
        conversations.HasKey(conversation => conversation.Id);
        conversations.Property(conversation => conversation.Kind).HasMaxLength(32).IsRequired();
        conversations.HasOne<Room>()
            .WithMany()
            .HasForeignKey(conversation => conversation.RoomId)
            .OnDelete(DeleteBehavior.Cascade);
        conversations.HasOne<UserAccount>()
            .WithMany()
            .HasForeignKey(conversation => conversation.DirectFirstUserId)
            .OnDelete(DeleteBehavior.Cascade);
        conversations.HasOne<UserAccount>()
            .WithMany()
            .HasForeignKey(conversation => conversation.DirectSecondUserId)
            .OnDelete(DeleteBehavior.Cascade);
        conversations.HasIndex(conversation => conversation.RoomId).IsUnique();
        conversations.HasIndex(conversation => new { conversation.DirectFirstUserId, conversation.DirectSecondUserId }).IsUnique();

        var conversationMessages = modelBuilder.Entity<ConversationMessage>();
        conversationMessages.ToTable("conversation_messages");
        conversationMessages.HasKey(message => message.Id);
        conversationMessages.Property(message => message.EventType).HasMaxLength(128).IsRequired();
        conversationMessages.Property(message => message.TextContent).HasColumnType("TEXT");
        conversationMessages.Property(message => message.PayloadJson).HasColumnType("TEXT").IsRequired();
        conversationMessages.HasOne<Conversation>()
            .WithMany()
            .HasForeignKey(message => message.ConversationId)
            .OnDelete(DeleteBehavior.Cascade);
        conversationMessages.HasOne<UserAccount>()
            .WithMany()
            .HasForeignKey(message => message.ActorUserId)
            .OnDelete(DeleteBehavior.SetNull);
        conversationMessages.HasIndex(message => new { message.ConversationId, message.MessageId });
        conversationMessages.HasIndex(message => new { message.ConversationId, message.Watermark }).IsUnique();

        var conversationReadStates = modelBuilder.Entity<ConversationReadState>();
        conversationReadStates.ToTable("conversation_read_states");
        conversationReadStates.HasKey(state => state.Id);
        conversationReadStates.HasOne<Conversation>()
            .WithMany()
            .HasForeignKey(state => state.ConversationId)
            .OnDelete(DeleteBehavior.Cascade);
        conversationReadStates.HasOne<UserAccount>()
            .WithMany()
            .HasForeignKey(state => state.UserAccountId)
            .OnDelete(DeleteBehavior.Cascade);
        conversationReadStates.HasIndex(state => new { state.ConversationId, state.UserAccountId }).IsUnique();
        conversationReadStates.HasIndex(state => new { state.UserAccountId, state.UpdatedAtUtc });

        var messageAttachments = modelBuilder.Entity<MessageAttachment>();
        messageAttachments.ToTable("message_attachments");
        messageAttachments.HasKey(attachment => attachment.Id);
        messageAttachments.Property(attachment => attachment.OriginalFileName).HasMaxLength(255).IsRequired();
        messageAttachments.Property(attachment => attachment.StoredFileName).HasMaxLength(255).IsRequired();
        messageAttachments.Property(attachment => attachment.RelativePath).HasMaxLength(1024).IsRequired();
        messageAttachments.Property(attachment => attachment.ContentType).HasMaxLength(255).IsRequired();
        messageAttachments.HasOne<Conversation>()
            .WithMany()
            .HasForeignKey(attachment => attachment.ConversationId)
            .OnDelete(DeleteBehavior.Cascade);
        messageAttachments.HasOne<UserAccount>()
            .WithMany()
            .HasForeignKey(attachment => attachment.UploadedByUserId)
            .OnDelete(DeleteBehavior.Cascade);
        messageAttachments.HasIndex(attachment => new { attachment.ConversationId, attachment.MessageId });
        messageAttachments.HasIndex(attachment => attachment.RelativePath).IsUnique();

        var roomMembers = modelBuilder.Entity<RoomMember>();
        roomMembers.ToTable("room_members");
        roomMembers.HasKey(roomMember => roomMember.Id);
        roomMembers.HasOne<Room>()
            .WithMany()
            .HasForeignKey(roomMember => roomMember.RoomId)
            .OnDelete(DeleteBehavior.Cascade);
        roomMembers.HasOne<UserAccount>()
            .WithMany()
            .HasForeignKey(roomMember => roomMember.UserId)
            .OnDelete(DeleteBehavior.Cascade);
        roomMembers.HasIndex(roomMember => new { roomMember.RoomId, roomMember.UserId }).IsUnique();
        roomMembers.HasIndex(roomMember => roomMember.UserId);

        var roomAdmins = modelBuilder.Entity<RoomAdmin>();
        roomAdmins.ToTable("room_admins");
        roomAdmins.HasKey(roomAdmin => roomAdmin.Id);
        roomAdmins.HasOne<Room>()
            .WithMany()
            .HasForeignKey(roomAdmin => roomAdmin.RoomId)
            .OnDelete(DeleteBehavior.Cascade);
        roomAdmins.HasOne<UserAccount>()
            .WithMany()
            .HasForeignKey(roomAdmin => roomAdmin.UserId)
            .OnDelete(DeleteBehavior.Cascade);
        roomAdmins.HasOne<UserAccount>()
            .WithMany()
            .HasForeignKey(roomAdmin => roomAdmin.GrantedByUserId)
            .OnDelete(DeleteBehavior.Cascade);
        roomAdmins.HasIndex(roomAdmin => new { roomAdmin.RoomId, roomAdmin.UserId }).IsUnique();

        var roomInvitations = modelBuilder.Entity<RoomInvitation>();
        roomInvitations.ToTable("room_invitations");
        roomInvitations.HasKey(roomInvitation => roomInvitation.Id);
        roomInvitations.HasOne<Room>()
            .WithMany()
            .HasForeignKey(roomInvitation => roomInvitation.RoomId)
            .OnDelete(DeleteBehavior.Cascade);
        roomInvitations.HasOne<UserAccount>()
            .WithMany()
            .HasForeignKey(roomInvitation => roomInvitation.InvitedUserId)
            .OnDelete(DeleteBehavior.Cascade);
        roomInvitations.HasOne<UserAccount>()
            .WithMany()
            .HasForeignKey(roomInvitation => roomInvitation.InvitedByUserId)
            .OnDelete(DeleteBehavior.Cascade);
        roomInvitations.HasIndex(roomInvitation => new { roomInvitation.RoomId, roomInvitation.InvitedUserId, roomInvitation.Status });
        roomInvitations.HasIndex(roomInvitation => new { roomInvitation.InvitedUserId, roomInvitation.Status });

        var roomBans = modelBuilder.Entity<RoomBan>();
        roomBans.ToTable("room_bans");
        roomBans.HasKey(roomBan => roomBan.Id);
        roomBans.Property(roomBan => roomBan.Reason).HasMaxLength(512);
        roomBans.HasOne<Room>()
            .WithMany()
            .HasForeignKey(roomBan => roomBan.RoomId)
            .OnDelete(DeleteBehavior.Cascade);
        roomBans.HasOne<UserAccount>()
            .WithMany()
            .HasForeignKey(roomBan => roomBan.UserId)
            .OnDelete(DeleteBehavior.Cascade);
        roomBans.HasOne<UserAccount>()
            .WithMany()
            .HasForeignKey(roomBan => roomBan.BannedByUserId)
            .OnDelete(DeleteBehavior.Cascade);
        roomBans.HasIndex(roomBan => new { roomBan.RoomId, roomBan.UserId }).IsUnique();
    }
}

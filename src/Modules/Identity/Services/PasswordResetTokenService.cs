using System.Security.Cryptography;
using System.Text;

namespace SlackApp.Modules.Identity.Services;

public sealed class PasswordResetTokenService
{
    public string GenerateToken()
    {
        return Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
    }

    public string HashToken(string token)
    {
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
    }
}

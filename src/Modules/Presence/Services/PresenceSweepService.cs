using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace SlackApp.Modules.Presence.Services;

internal sealed class PresenceSweepService(
    PresenceService presenceService,
    IOptions<PresenceOptions> optionsAccessor,
    ILogger<PresenceSweepService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var sweepInterval = TimeSpan.FromSeconds(Math.Max(1, optionsAccessor.Value.SweepIntervalSeconds));

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(sweepInterval, stoppingToken);
                await presenceService.SweepAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "Presence sweep failed.");
            }
        }
    }
}

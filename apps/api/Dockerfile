FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY apps/api/SlackApp.Api.csproj apps/api/
RUN dotnet restore apps/api/SlackApp.Api.csproj

COPY . .
RUN dotnet publish apps/api/SlackApp.Api.csproj -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=5 \
  CMD curl --fail http://localhost:8080/healthz || exit 1

ENTRYPOINT ["dotnet", "SlackApp.Api.dll"]

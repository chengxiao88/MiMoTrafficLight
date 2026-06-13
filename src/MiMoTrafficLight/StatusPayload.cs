using System;
using System.Text.Json.Serialization;

namespace MiMoTrafficLight;

internal sealed class StatusPayload
{
    [JsonPropertyName("state")]
    public string? State { get; set; }

    [JsonPropertyName("source")]
    public string? Source { get; set; }

    [JsonPropertyName("event")]
    public string? Event { get; set; }

    [JsonPropertyName("sessionId")]
    public string? SessionId { get; set; }

    [JsonPropertyName("projectDir")]
    public string? ProjectDir { get; set; }

    [JsonPropertyName("updatedAt")]
    public DateTimeOffset? UpdatedAt { get; set; }
}

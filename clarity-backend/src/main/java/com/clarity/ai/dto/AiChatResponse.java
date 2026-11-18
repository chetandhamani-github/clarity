package com.clarity.ai.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Conversational financial copilot response")
public class AiChatResponse {

    @Schema(description = "AI assistant advice and answer", example = "You have spent ₹4,500 on Food & Dining so far this month, which is 18% of your overall expenses.")
    private String reply;

    @Schema(description = "Deep link or suggested screen in app", example = "/(app)/(tabs)/plan")
    private String suggestedAction;
}


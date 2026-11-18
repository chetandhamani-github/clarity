package com.clarity.ai.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Request payload for AI transaction categorization")
public class AiCategorizeRequest {

    @NotBlank(message = "merchant must not be blank")
    @Schema(description = "Raw merchant string or UPI description", example = "UPI/P2A/3948/SHREE_GANESH_KIRANA/BLR")
    private String merchant;

    @Schema(description = "Transaction amount for context", example = "450.0")
    private Double amount;

    @Schema(description = "Optional transaction note or bank description", example = "Daily grocery shopping")
    private String note;
}


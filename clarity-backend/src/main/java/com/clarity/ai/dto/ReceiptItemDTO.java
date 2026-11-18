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
@Schema(description = "Individual item extracted from a receipt")
public class ReceiptItemDTO {

    @Schema(description = "Item or product name", example = "Almond Milk 1L")
    private String name;

    @Schema(description = "Item line price", example = "320.0")
    private Double amount;

    @Schema(description = "Item category", example = "Groceries")
    private String category;

    @Schema(description = "Quantity purchased", example = "1")
    private Integer quantity;
}


package com.clarity.ai.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class VoiceParseResponse {
    private String merchant;
    private Double amount;
    private String category;
    private String account;
    private String type;
    private String note;
    private Double confidence;
}

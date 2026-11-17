package com.clarity.splitwise.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SplitPersonDTO {
    private String id;
    private String name;
    private String email;
    private String phone;
    private String notes;
    private String avatarUrl;
    private boolean isDeleted;
    private String createdAt;
    private String updatedAt;
}

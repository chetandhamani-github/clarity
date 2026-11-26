package com.clarity.splitwise.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SplitGroupDTO {
    private String id;
    private String name;
    private String description;
    private String icon;
    private String category;
    private String currency;
    private String ownerEmail;
    private List<String> memberIds;
    private List<SplitGroupMemberDTO> members;
    private boolean isArchived;
    private boolean isDeleted;
    private String createdAt;
    private String updatedAt;
}


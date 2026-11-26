package com.clarity.splitwise.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SplitGroupMemberDTO {
    private String personId;
    private String email;
    private String name;
    private String role;
}


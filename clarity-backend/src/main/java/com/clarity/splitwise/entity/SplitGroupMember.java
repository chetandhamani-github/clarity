package com.clarity.splitwise.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "split_group_members", indexes = {
        @Index(name = "idx_split_group_members_group", columnList = "group_id"),
        @Index(name = "idx_split_group_members_person", columnList = "person_id")
}, uniqueConstraints = {
        @UniqueConstraint(name = "uq_split_group_members", columnNames = {"group_id", "person_id"})
})
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@ToString
public class SplitGroupMember {

    @Id
    @Column(name = "id", nullable = false, length = 255)
    private String id;

    @Column(name = "group_id", nullable = false, length = 255)
    private String groupId;

    @Column(name = "person_id", nullable = false, length = 255)
    private String personId;

    @Column(name = "member_email", length = 255)
    private String memberEmail;

    @Column(name = "member_name", length = 255)
    private String memberName;

    @Column(name = "role", nullable = false, length = 50)
    @Builder.Default
    private String role = "member";

    @Column(name = "joined_at", nullable = false)
    @Builder.Default
    private Instant joinedAt = Instant.now();
}


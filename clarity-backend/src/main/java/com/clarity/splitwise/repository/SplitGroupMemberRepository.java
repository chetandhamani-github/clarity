package com.clarity.splitwise.repository;

import com.clarity.splitwise.entity.SplitGroupMember;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SplitGroupMemberRepository extends JpaRepository<SplitGroupMember, String> {

    List<SplitGroupMember> findByGroupId(String groupId);

    Optional<SplitGroupMember> findByGroupIdAndPersonId(String groupId, String personId);

    void deleteByGroupId(String groupId);
}


package com.clarity.splitwise.repository;

import com.clarity.splitwise.entity.SplitExpense;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface SplitExpenseRepository extends JpaRepository<SplitExpense, String> {

    List<SplitExpense> findByInstallationId(String installationId);

    List<SplitExpense> findByInstallationIdAndUpdatedAtAfter(String installationId, Instant since);

    Optional<SplitExpense> findByIdAndInstallationId(String id, String installationId);

    List<SplitExpense> findByGroupId(String groupId);

    List<SplitExpense> findByOwnerEmail(String ownerEmail);

    List<SplitExpense> findByOwnerEmailAndUpdatedAtAfter(String ownerEmail, Instant since);
}


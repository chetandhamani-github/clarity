package com.clarity.splitwise.repository;

import com.clarity.splitwise.entity.SplitDebt;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface SplitDebtRepository extends JpaRepository<SplitDebt, String> {

    List<SplitDebt> findByInstallationId(String installationId);

    List<SplitDebt> findByInstallationIdAndUpdatedAtAfter(String installationId, Instant since);

    Optional<SplitDebt> findByIdAndInstallationId(String id, String installationId);

    long countByInstallationIdAndIsDeletedFalse(String installationId);

    List<SplitDebt> findByOwnerEmail(String ownerEmail);

    List<SplitDebt> findByOwnerEmailAndUpdatedAtAfter(String ownerEmail, Instant since);
}

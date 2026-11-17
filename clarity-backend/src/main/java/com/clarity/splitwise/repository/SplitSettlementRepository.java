package com.clarity.splitwise.repository;

import com.clarity.splitwise.entity.SplitSettlement;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface SplitSettlementRepository extends JpaRepository<SplitSettlement, String> {

    List<SplitSettlement> findByInstallationId(String installationId);

    List<SplitSettlement> findByInstallationIdAndUpdatedAtAfter(String installationId, Instant since);

    Optional<SplitSettlement> findByIdAndInstallationId(String id, String installationId);

    long countByInstallationIdAndIsDeletedFalse(String installationId);
}

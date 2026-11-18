package com.clarity.splitwise.repository;

import com.clarity.splitwise.entity.SplitExpenseSplit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface SplitExpenseSplitRepository extends JpaRepository<SplitExpenseSplit, String> {

    List<SplitExpenseSplit> findByExpenseId(String expenseId);

    void deleteByExpenseId(String expenseId);
}


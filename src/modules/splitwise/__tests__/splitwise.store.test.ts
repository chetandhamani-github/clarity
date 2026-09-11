import { useSplitwiseStore } from '../store/splitwise.store';
import { SplitwiseRepository } from '../database/splitwise.repository';

jest.mock('../database/splitwise.repository');

describe('useSplitwiseStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSplitwiseStore.setState({
      people: [],
      peopleWithBalances: [],
      debts: [],
      settlements: [],
      overallSummary: {
        totalOwedToMe: 0,
        totalIOwe: 0,
        totalSettled: 0,
        netBalance: 0,
        peopleCount: 0,
      },
      selectedPersonId: null,
      selectedFilter: 'ALL',
      searchQuery: '',
      isLoading: false,
      error: null,
    });
  });

  it('loads people, balances, and overall summary', async () => {
    const mockPeople = [{ id: 'p-1', name: 'Aarav', createdAt: '2026-09-11' }];
    const mockBalances = [
      {
        person: mockPeople[0],
        totalOwedToMe: 500,
        totalIOwe: 0,
        totalSettled: 0,
        netBalance: 500,
      },
    ];
    const mockSummary = {
      totalOwedToMe: 500,
      totalIOwe: 0,
      totalSettled: 0,
      netBalance: 500,
      peopleCount: 1,
    };

    (SplitwiseRepository.getAllPeople as jest.Mock).mockResolvedValue(mockPeople);
    (SplitwiseRepository.getAllPeopleWithBalances as jest.Mock).mockResolvedValue(mockBalances);
    (SplitwiseRepository.getOverallSummary as jest.Mock).mockResolvedValue(mockSummary);

    await useSplitwiseStore.getState().loadPeople();

    const state = useSplitwiseStore.getState();
    expect(state.people).toEqual(mockPeople);
    expect(state.peopleWithBalances).toEqual(mockBalances);
    expect(state.overallSummary).toEqual(mockSummary);
    expect(state.isLoading).toBe(false);
  });

  it('adds a person and refreshes list', async () => {
    const newPerson = { id: 'p-2', name: 'Neha', createdAt: '2026-09-11' };
    (SplitwiseRepository.createPerson as jest.Mock).mockResolvedValue(newPerson);
    (SplitwiseRepository.getAllPeople as jest.Mock).mockResolvedValue([newPerson]);
    (SplitwiseRepository.getAllPeopleWithBalances as jest.Mock).mockResolvedValue([]);
    (SplitwiseRepository.getOverallSummary as jest.Mock).mockResolvedValue({
      totalOwedToMe: 0,
      totalIOwe: 0,
      totalSettled: 0,
      netBalance: 0,
      peopleCount: 1,
    });

    const result = await useSplitwiseStore.getState().addPerson({ name: 'Neha' });

    expect(result).toEqual(newPerson);
    expect(SplitwiseRepository.createPerson).toHaveBeenCalledWith({ name: 'Neha' });
  });

  it('adds debt and triggers refresh', async () => {
    const newDebt = {
      id: 'd-1',
      personId: 'p-1',
      amount: 450,
      type: 'OWE_ME' as const,
      description: 'Lunch',
      createdAt: '2026-09-11',
    };
    (SplitwiseRepository.createDebt as jest.Mock).mockResolvedValue(newDebt);
    (SplitwiseRepository.getAllDebts as jest.Mock).mockResolvedValue([newDebt]);
    (SplitwiseRepository.getAllPeople as jest.Mock).mockResolvedValue([]);
    (SplitwiseRepository.getAllPeopleWithBalances as jest.Mock).mockResolvedValue([]);
    (SplitwiseRepository.getOverallSummary as jest.Mock).mockResolvedValue({
      totalOwedToMe: 450,
      totalIOwe: 0,
      totalSettled: 0,
      netBalance: 450,
      peopleCount: 1,
    });

    const result = await useSplitwiseStore.getState().addDebt({
      personId: 'p-1',
      amount: 450,
      type: 'OWE_ME',
      description: 'Lunch',
    });

    expect(result).toEqual(newDebt);
    expect(SplitwiseRepository.createDebt).toHaveBeenCalledWith({
      personId: 'p-1',
      amount: 450,
      type: 'OWE_ME',
      description: 'Lunch',
    });
  });

  it('adds settlement and triggers refresh', async () => {
    const newSettlement = {
      id: 's-1',
      personId: 'p-1',
      amount: 450,
      description: 'Settled via UPI',
      createdAt: '2026-09-11',
    };
    (SplitwiseRepository.createSettlement as jest.Mock).mockResolvedValue(newSettlement);
    (SplitwiseRepository.getAllSettlements as jest.Mock).mockResolvedValue([newSettlement]);
    (SplitwiseRepository.getAllPeople as jest.Mock).mockResolvedValue([]);
    (SplitwiseRepository.getAllPeopleWithBalances as jest.Mock).mockResolvedValue([]);
    (SplitwiseRepository.getOverallSummary as jest.Mock).mockResolvedValue({
      totalOwedToMe: 450,
      totalIOwe: 0,
      totalSettled: 450,
      netBalance: 0,
      peopleCount: 1,
    });

    const result = await useSplitwiseStore.getState().addSettlement({
      personId: 'p-1',
      amount: 450,
      description: 'Settled via UPI',
    });

    expect(result).toEqual(newSettlement);
    expect(SplitwiseRepository.createSettlement).toHaveBeenCalledWith({
      personId: 'p-1',
      amount: 450,
      description: 'Settled via UPI',
    });
  });

  it('deletes person and updates selection', async () => {
    (SplitwiseRepository.deletePerson as jest.Mock).mockResolvedValue(undefined);
    (SplitwiseRepository.ensureSchema as jest.Mock).mockResolvedValue(undefined);
    (SplitwiseRepository.getAllPeople as jest.Mock).mockResolvedValue([]);
    (SplitwiseRepository.getAllPeopleWithBalances as jest.Mock).mockResolvedValue([]);
    (SplitwiseRepository.getAllDebts as jest.Mock).mockResolvedValue([]);
    (SplitwiseRepository.getAllSettlements as jest.Mock).mockResolvedValue([]);
    (SplitwiseRepository.getOverallSummary as jest.Mock).mockResolvedValue({
      totalOwedToMe: 0,
      totalIOwe: 0,
      totalSettled: 0,
      netBalance: 0,
      peopleCount: 0,
    });

    useSplitwiseStore.setState({ selectedPersonId: 'p-1' });

    await useSplitwiseStore.getState().deletePerson('p-1');

    expect(SplitwiseRepository.deletePerson).toHaveBeenCalledWith('p-1');
    expect(useSplitwiseStore.getState().selectedPersonId).toBeNull();
  });
});

const service = require('../src/services/taskService');

beforeEach(() => {
  service._reset();
});

// small helper so tests read cleanly
const seed = (overrides = {}) =>
  service.create({ title: 'Task', ...overrides });

describe('create', () => {
  it('creates a task with sensible defaults', () => {
    const task = seed({ title: 'Buy milk' });

    expect(task.id).toBeDefined();
    expect(task.title).toBe('Buy milk');
    expect(task.status).toBe('todo');
    expect(task.priority).toBe('medium');
    expect(task.description).toBe('');
    expect(task.dueDate).toBeNull();
    expect(task.assignee).toBeNull();
    expect(task.completedAt).toBeNull();
    expect(task.createdAt).toBeDefined();
  });

  it('keeps values that were passed in', () => {
    const task = seed({
      title: 'Ship release',
      status: 'in_progress',
      priority: 'high',
      dueDate: '2025-01-01T00:00:00.000Z',
    });

    expect(task.status).toBe('in_progress');
    expect(task.priority).toBe('high');
    expect(task.dueDate).toBe('2025-01-01T00:00:00.000Z');
  });
});

describe('findById', () => {
  it('returns the matching task', () => {
    const task = seed();
    expect(service.findById(task.id)).toEqual(task);
  });

  it('returns undefined for an unknown id', () => {
    expect(service.findById('nope')).toBeUndefined();
  });
});

describe('getByStatus', () => {
  it('returns only tasks with the exact status', () => {
    seed({ status: 'todo' });
    seed({ status: 'in_progress' });
    seed({ status: 'done' });

    expect(service.getByStatus('todo')).toHaveLength(1);
    expect(service.getByStatus('in_progress')).toHaveLength(1);
    expect(service.getByStatus('done')).toHaveLength(1);
  });

  // Guards against the substring-match bug: 'do' should NOT match 'todo' or 'done'.
  it('does not match on partial status strings', () => {
    seed({ status: 'todo' });
    seed({ status: 'done' });

    expect(service.getByStatus('do')).toHaveLength(0);
  });
});

describe('getPaginated', () => {
  beforeEach(() => {
    for (let i = 1; i <= 25; i++) seed({ title: `Task ${i}` });
  });

  it('returns the first page starting from the first task', () => {
    const page = service.getPaginated(1, 10);
    expect(page).toHaveLength(10);
    expect(page[0].title).toBe('Task 1');
    expect(page[9].title).toBe('Task 10');
  });

  it('returns the second page', () => {
    const page = service.getPaginated(2, 10);
    expect(page[0].title).toBe('Task 11');
    expect(page[9].title).toBe('Task 20');
  });

  it('returns a partial final page', () => {
    const page = service.getPaginated(3, 10);
    expect(page).toHaveLength(5);
    expect(page[0].title).toBe('Task 21');
  });
});

describe('update', () => {
  it('updates the given fields', () => {
    const task = seed();
    const updated = service.update(task.id, { title: 'New title', priority: 'high' });

    expect(updated.title).toBe('New title');
    expect(updated.priority).toBe('high');
  });

  it('returns null for an unknown id', () => {
    expect(service.update('nope', { title: 'x' })).toBeNull();
  });

  // id and createdAt are identity/audit fields and must not be client-writable.
  it('ignores attempts to overwrite id or createdAt', () => {
    const task = seed();
    const originalId = task.id;
    const originalCreatedAt = task.createdAt;

    const updated = service.update(task.id, {
      id: 'hacked',
      createdAt: '1999-01-01T00:00:00.000Z',
      title: 'legit change',
    });

    expect(updated.id).toBe(originalId);
    expect(updated.createdAt).toBe(originalCreatedAt);
    expect(updated.title).toBe('legit change');
    // task must still be findable by its real id
    expect(service.findById(originalId)).toBeDefined();
  });
});

describe('remove', () => {
  it('removes an existing task', () => {
    const task = seed();
    expect(service.remove(task.id)).toBe(true);
    expect(service.getAll()).toHaveLength(0);
  });

  it('returns false for an unknown id', () => {
    expect(service.remove('nope')).toBe(false);
  });
});

describe('completeTask', () => {
  it('sets status to done and stamps completedAt', () => {
    const task = seed();
    const done = service.completeTask(task.id);

    expect(done.status).toBe('done');
    expect(done.completedAt).not.toBeNull();
  });

  // Completing a task should not silently downgrade its priority.
  it('preserves the original priority', () => {
    const task = seed({ priority: 'high' });
    const done = service.completeTask(task.id);
    expect(done.priority).toBe('high');
  });

  it('returns null for an unknown id', () => {
    expect(service.completeTask('nope')).toBeNull();
  });
});

describe('getStats', () => {
  it('counts tasks by status', () => {
    seed({ status: 'todo' });
    seed({ status: 'todo' });
    seed({ status: 'in_progress' });
    seed({ status: 'done' });

    const stats = service.getStats();
    expect(stats.todo).toBe(2);
    expect(stats.in_progress).toBe(1);
    expect(stats.done).toBe(1);
  });

  it('counts overdue tasks that are not done', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    const future = new Date(Date.now() + 86400000).toISOString();

    seed({ status: 'todo', dueDate: past });      // overdue
    seed({ status: 'in_progress', dueDate: past }); // overdue
    seed({ status: 'done', dueDate: past });       // done -> not overdue
    seed({ status: 'todo', dueDate: future });     // not due yet

    expect(service.getStats().overdue).toBe(2);
  });
});

describe('assign', () => {
  it('stores the assignee on the task', () => {
    const task = seed();
    const updated = service.assign(task.id, 'Priya');
    expect(updated.assignee).toBe('Priya');
  });

  it('overwrites a previous assignee (reassignment)', () => {
    const task = seed();
    service.assign(task.id, 'Priya');
    const updated = service.assign(task.id, 'Rahul');
    expect(updated.assignee).toBe('Rahul');
  });

  it('returns null for an unknown id', () => {
    expect(service.assign('nope', 'Priya')).toBeNull();
  });
});

const request = require('supertest');
const app = require('../src/app');
const service = require('../src/services/taskService');

beforeEach(() => {
  service._reset();
});

const createTask = (body = { title: 'Task' }) =>
  request(app).post('/tasks').send(body);

describe('POST /tasks', () => {
  it('creates a task and returns 201', async () => {
    const res = await createTask({ title: 'Write tests', priority: 'high' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.title).toBe('Write tests');
    expect(res.body.priority).toBe('high');
    expect(res.body.status).toBe('todo');
  });

  it('rejects a missing title with 400', async () => {
    const res = await createTask({ priority: 'high' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/i);
  });

  it('rejects a blank title with 400', async () => {
    const res = await createTask({ title: '   ' });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid status with 400', async () => {
    const res = await createTask({ title: 'x', status: 'archived' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/status/i);
  });

  it('rejects an invalid priority with 400', async () => {
    const res = await createTask({ title: 'x', priority: 'urgent' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/priority/i);
  });

  it('rejects an invalid dueDate with 400', async () => {
    const res = await createTask({ title: 'x', dueDate: 'not-a-date' });
    expect(res.status).toBe(400);
  });
});

describe('GET /tasks', () => {
  it('returns all tasks', async () => {
    await createTask({ title: 'A' });
    await createTask({ title: 'B' });

    const res = await request(app).get('/tasks');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('filters by status', async () => {
    await createTask({ title: 'A', status: 'todo' });
    await createTask({ title: 'B', status: 'done' });

    const res = await request(app).get('/tasks?status=done');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('B');
  });

  it('paginates and includes the very first task on page 1', async () => {
    for (let i = 1; i <= 15; i++) await createTask({ title: `Task ${i}` });

    const res = await request(app).get('/tasks?page=1&limit=10');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(10);
    expect(res.body[0].title).toBe('Task 1');
  });

  it('returns the second page', async () => {
    for (let i = 1; i <= 15; i++) await createTask({ title: `Task ${i}` });

    const res = await request(app).get('/tasks?page=2&limit=10');
    expect(res.body).toHaveLength(5);
    expect(res.body[0].title).toBe('Task 11');
  });
});

describe('PUT /tasks/:id', () => {
  it('updates an existing task', async () => {
    const { body: task } = await createTask({ title: 'Old' });

    const res = await request(app)
      .put(`/tasks/${task.id}`)
      .send({ title: 'New', status: 'in_progress' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('New');
    expect(res.body.status).toBe('in_progress');
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).put('/tasks/does-not-exist').send({ title: 'x' });
    expect(res.status).toBe(404);
  });

  it('returns 400 for an invalid body', async () => {
    const { body: task } = await createTask();
    const res = await request(app).put(`/tasks/${task.id}`).send({ title: '' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid status, priority or dueDate', async () => {
    const { body: task } = await createTask();

    const badStatus = await request(app).put(`/tasks/${task.id}`).send({ status: 'archived' });
    expect(badStatus.status).toBe(400);

    const badPriority = await request(app).put(`/tasks/${task.id}`).send({ priority: 'urgent' });
    expect(badPriority.status).toBe(400);

    const badDate = await request(app).put(`/tasks/${task.id}`).send({ dueDate: 'nope' });
    expect(badDate.status).toBe(400);
  });

  it('does not let the client change the id via the body', async () => {
    const { body: task } = await createTask({ title: 'Keep me' });

    await request(app).put(`/tasks/${task.id}`).send({ id: 'spoofed', title: 'Renamed' });

    // original id must still resolve
    const res = await request(app).get('/tasks');
    expect(res.body[0].id).toBe(task.id);
    expect(res.body[0].title).toBe('Renamed');
  });
});

describe('DELETE /tasks/:id', () => {
  it('deletes a task and returns 204', async () => {
    const { body: task } = await createTask();

    const res = await request(app).delete(`/tasks/${task.id}`);
    expect(res.status).toBe(204);

    const list = await request(app).get('/tasks');
    expect(list.body).toHaveLength(0);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).delete('/tasks/nope');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /tasks/:id/complete', () => {
  it('marks a task as done', async () => {
    const { body: task } = await createTask({ title: 'x', priority: 'high' });

    const res = await request(app).patch(`/tasks/${task.id}/complete`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
    expect(res.body.completedAt).not.toBeNull();
    // priority should survive completion
    expect(res.body.priority).toBe('high');
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).patch('/tasks/nope/complete');
    expect(res.status).toBe(404);
  });
});

describe('GET /tasks/stats', () => {
  it('returns counts by status and overdue count', async () => {
    const past = new Date(Date.now() - 86400000).toISOString();

    await createTask({ title: 'a', status: 'todo', dueDate: past });
    await createTask({ title: 'b', status: 'done' });

    const res = await request(app).get('/tasks/stats');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ todo: 1, in_progress: 0, done: 1, overdue: 1 });
  });
});

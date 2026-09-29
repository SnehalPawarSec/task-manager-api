const request = require('supertest');
const app = require('../src/app');
const service = require('../src/services/taskService');

beforeEach(() => {
  service._reset();
});

const createTask = () =>
  request(app).post('/tasks').send({ title: 'Task' }).then((r) => r.body);

describe('PATCH /tasks/:id/assign', () => {
  it('assigns a task to a user and returns the updated task', async () => {
    const task = await createTask();

    const res = await request(app)
      .patch(`/tasks/${task.id}/assign`)
      .send({ assignee: 'Priya' });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(task.id);
    expect(res.body.assignee).toBe('Priya');
  });

  it('trims surrounding whitespace from the assignee', async () => {
    const task = await createTask();

    const res = await request(app)
      .patch(`/tasks/${task.id}/assign`)
      .send({ assignee: '  Priya  ' });

    expect(res.status).toBe(200);
    expect(res.body.assignee).toBe('Priya');
  });

  it('allows reassigning to a different user', async () => {
    const task = await createTask();

    await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: 'Priya' });
    const res = await request(app)
      .patch(`/tasks/${task.id}/assign`)
      .send({ assignee: 'Rahul' });

    expect(res.status).toBe(200);
    expect(res.body.assignee).toBe('Rahul');
  });

  it('returns 404 when the task does not exist', async () => {
    const res = await request(app)
      .patch('/tasks/does-not-exist/assign')
      .send({ assignee: 'Priya' });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 400 when assignee is missing', async () => {
    const task = await createTask();
    const res = await request(app).patch(`/tasks/${task.id}/assign`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/assignee/i);
  });

  it('returns 400 when assignee is an empty string', async () => {
    const task = await createTask();
    const res = await request(app)
      .patch(`/tasks/${task.id}/assign`)
      .send({ assignee: '' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when assignee is only whitespace', async () => {
    const task = await createTask();
    const res = await request(app)
      .patch(`/tasks/${task.id}/assign`)
      .send({ assignee: '   ' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when assignee is not a string', async () => {
    const task = await createTask();
    const res = await request(app)
      .patch(`/tasks/${task.id}/assign`)
      .send({ assignee: 42 });
    expect(res.status).toBe(400);
  });
});

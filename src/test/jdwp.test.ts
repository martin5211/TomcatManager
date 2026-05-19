import { detectJdwpPort } from '../core/jdwp';

describe('detectJdwpPort', () => {
  it('parses -agentlib:jdwp with address=*:PORT', () => {
    const opts = '-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005';
    expect(detectJdwpPort(opts)).toBe(5005);
  });

  it('parses -agentlib:jdwp with address=localhost:PORT', () => {
    const opts = '-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=localhost:8000';
    expect(detectJdwpPort(opts)).toBe(8000);
  });

  it('parses -agentlib:jdwp with bare numeric address', () => {
    const opts = '-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=9999';
    expect(detectJdwpPort(opts)).toBe(9999);
  });

  it('parses legacy -Xrunjdwp form', () => {
    const opts = '-Xrunjdwp:transport=dt_socket,server=y,suspend=n,address=7777';
    expect(detectJdwpPort(opts)).toBe(7777);
  });

  it('finds the agent flag among other JVM options', () => {
    const opts = '-Xmx1g -Denv=dev -agentlib:jdwp=transport=dt_socket,address=*:5005,server=y -Xms256m';
    expect(detectJdwpPort(opts)).toBe(5005);
  });

  it('returns undefined when no agent flag is present', () => {
    expect(detectJdwpPort('-Xmx1g -Denv=dev')).toBeUndefined();
  });

  it('returns undefined when agent flag has no address', () => {
    expect(detectJdwpPort('-agentlib:jdwp=transport=dt_socket,server=y')).toBeUndefined();
  });

  it('returns undefined for empty input', () => {
    expect(detectJdwpPort('')).toBeUndefined();
  });

  it('does not match unrelated agentlib agents', () => {
    expect(detectJdwpPort('-agentlib:hprof=cpu=samples,address=8080')).toBeUndefined();
  });
});

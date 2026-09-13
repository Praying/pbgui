import { describe, expect, it } from 'vitest';
import {
  BASE_REMOTE_SERVICES,
  botIdentifier,
  groupRemoteLogItems,
  remoteLogItem,
  remoteLogItems,
  remoteRestartBlocker,
  remoteRestartCommand,
} from './vpsLogItems';

describe('vpsLogItems', () => {
  it('lists the base services when a host has no metadata', () => {
    const items = remoteLogItems('alpha', {});
    expect(items.map((item) => item.value)).toEqual([...BASE_REMOTE_SERVICES]);
    expect(items.every((item) => item.kind === 'service')).toBe(true);
  });

  it('narrows services to the host available_logs and appends extra files', () => {
    const items = remoteLogItems('alpha', {
      host_meta: { alpha: { available_logs: ['data/logs/PBRun.log', 'data/logs/PBData.log'] } },
    });
    expect(items.map((item) => item.value)).toEqual(['data/logs/PBRun.log', 'data/logs/PBData.log']);
    expect(items[0]!.label).toBe('PBRun.log');
  });

  it('hides master-only services on a slave without metadata', () => {
    const items = remoteLogItems('alpha', { host_meta: { alpha: { role: 'slave' } } });
    expect(items.map((item) => item.value)).toEqual(['PBRun', 'PBCoinData', 'PBData']);
  });

  it('adds running PB7 and PB8 instances as bot targets', () => {
    const items = remoteLogItems('alpha', {
      v7_instances: { alpha: [{ name: 'bot-a', running: true }, { name: 'idle', running: false }] },
      v8_instances: { alpha: [{ name: 'bot-b', running: true }] },
    });
    const bots = items.filter((item) => item.kind === 'bot');
    expect(bots.map((item) => item.value)).toEqual(['Bot:bot-a:7', 'Bot:bot-b:8']);
    expect(bots[0]).toMatchObject({ label: 'bot-a', detail: 'v7' });
  });

  it('appends bot_logs archive files after the service list', () => {
    const items = remoteLogItems('alpha', {
      bot_logs: { alpha: { 'bot-a': ['pb7/logs/data_run_v7_bot-a_config.log'] } },
    });
    const archive = items.find((item) => item.kind === 'archive');
    expect(archive).toBeDefined();
    expect(archive).toMatchObject({ label: 'bot-a', detail: 'history' });
  });

  it('keeps the raw target when the legacy pattern cannot attribute an archive', () => {
    // `_config.log` carries the bot marker; a `_config.json.log` basename does
    // not (legacy precedence), so the row falls back to the raw target.
    expect(remoteLogItem('pb7/logs/data_run_v7_bot-a_config.json.log')).toEqual({
      value: 'pb7/logs/data_run_v7_bot-a_config.json.log',
      label: 'pb7/logs/data_run_v7_bot-a_config.json.log',
      detail: 'history',
      kind: 'archive',
    });
  });

  it('labels a timestamped archive by its snapshot time', () => {
    // The timestamp must lead the basename, so it never coexists with the
    // `data_run_v7_` bot marker (same precedence as the legacy panel).
    expect(remoteLogItem('pb7/logs/20260823_123456_snapshot.log')).toMatchObject({
      kind: 'archive',
      label: '2026-08-23 12:34:56',
      detail: 'history',
    });
  });

  it('deduplicates repeated targets', () => {
    const items = remoteLogItems('alpha', {
      v7_instances: { alpha: [{ name: 'bot-a', running: true }, { name: 'bot-a', running: true }] },
    });
    expect(items.filter((item) => item.value === 'Bot:bot-a:7')).toHaveLength(1);
  });

  it('labels error logs and passivbot stderr paths', () => {
    expect(remoteLogItem('BotErr:bot-a')).toMatchObject({ label: 'bot-a', detail: 'error', kind: 'error' });
    expect(remoteLogItem('data/run_v7/bot-a/passivbot_err.log.old')).toMatchObject({
      label: 'bot-a',
      detail: 'error.old',
      kind: 'error',
    });
    expect(remoteLogItem('data/run_v7/bot-a/passivbot.log')).toMatchObject({ label: 'bot-a', kind: 'bot' });
  });

  it('groups items into services, bots and files', () => {
    const items = remoteLogItems('alpha', {
      v7_instances: { alpha: [{ name: 'bot-a', running: true }] },
      bot_logs: { alpha: { 'bot-a': ['data/logs/PBRun.log'] } },
    });
    const groups = groupRemoteLogItems(items);
    expect(groups.bots.map((item) => item.value)).toEqual(['Bot:bot-a:7']);
    expect(groups.files.map((item) => item.value)).toEqual(['data/logs/PBRun.log']);
    expect(groups.services.length).toBeGreaterThan(0);
  });

  it('parses bot identifiers with a default version', () => {
    expect(botIdentifier('Bot:bot-a:8')).toEqual({ name: 'bot-a', version: '8' });
    expect(botIdentifier('Bot:bot-a')).toEqual({ name: 'bot-a', version: '7' });
    expect(botIdentifier('PBRun')).toBeNull();
  });

  it('builds restart commands per target kind', () => {
    expect(remoteRestartCommand('alpha', 'PBRun')).toEqual({ cmd: 'restart_service', host: 'alpha', service: 'PBRun' });
    expect(remoteRestartCommand('alpha', 'Bot:bot-a:8')).toEqual({
      cmd: 'kill_instance',
      host: 'alpha',
      name: 'bot-a',
      pb_version: '8',
    });
    expect(remoteRestartCommand('', 'PBRun')).toBeNull();
  });

  it('blocks restart for disabled or unexpected services but never for bots', () => {
    expect(remoteRestartBlocker('PBRun', { PBRun: { status: 'disabled' } })).toBe('');
    expect(remoteRestartBlocker('PBRun', { PBRun: { expected: false, reason: 'not configured' } })).toBe('not configured');
    expect(remoteRestartBlocker('PBRun', { PBRun: { status: 'running' } })).toBe('');
    expect(remoteRestartBlocker('Bot:bot-a:7', { 'Bot:bot-a:7': { status: 'disabled' } })).toBe('');
  });
});

import { LLMEngineService } from './llm/LLMEngineService';
import { ToolRegistry } from './agent/ToolRegistry';
import { AgentOrchestrator } from './agent/AgentOrchestrator';
import { SecurityGate } from './security/SecurityGate';
import { EmbeddingService } from './memory/EmbeddingService';
import { MemoryService } from './memory/MemoryService';

import { locationTool } from './tools/LocationTool';
import {
  calendarListEvents,
  calendarCreateEvent,
} from './tools/CalendarTool';
import { contactsSearch } from './tools/ContactsTool';
import { fileRead, fileWrite } from './tools/FileTool';
import { notifySchedule } from './tools/NotificationTool';
import { bluetoothScan } from './tools/BluetoothTool';
import { healthRead } from './tools/HealthTool';
import { launchApp } from './tools/LaunchAppTool';
import type { ToolDefinition } from '../types/tool';

/**
 * Module-level singletons. Survive router remounts and are reachable from
 * non-React code (SecurityGate confirm bridge). Exposed to components via
 * ServicesContext.
 */
class Services {
  readonly engine = new LLMEngineService();
  readonly tools = new ToolRegistry();
  readonly security = new SecurityGate();
  readonly embeddings = new EmbeddingService();
  readonly memory = new MemoryService();
  readonly orchestrator = new AgentOrchestrator(this.engine, this.tools, this.security);

  private wired = false;

  /** Register every device-action tool once (deny-by-default registry). */
  wireTools(): void {
    if (this.wired) return;
    const all: ToolDefinition[] = [
      locationTool,
      calendarListEvents,
      calendarCreateEvent,
      contactsSearch,
      fileRead,
      fileWrite,
      notifySchedule,
      bluetoothScan,
      healthRead,
      launchApp,
    ];
    this.tools.registerAll(all);
    this.wired = true;
  }
}

export const services = new Services();

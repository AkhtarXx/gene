import { LLMEngineService } from './llm/LLMEngineService';
import { ToolRegistry } from './agent/ToolRegistry';
import { AgentOrchestrator } from './agent/AgentOrchestrator';
import { UserActionService } from './agent/UserActionService';
import { SecurityGate } from './security/SecurityGate';
import { EmbeddingService } from './memory/EmbeddingService';
import { MemoryService } from './memory/MemoryService';
import { appStore } from './storage/AppStore';
import { WhisperService } from './speech/WhisperService';

import { locationTool } from './tools/LocationTool';
import { calendarListEvents, calendarCreateEvent } from './tools/CalendarTool';
import { contactsSearch } from './tools/ContactsTool';
import { fileRead, fileWrite } from './tools/FileTool';
import { notifySchedule } from './tools/NotificationTool';
import { bluetoothScan } from './tools/BluetoothTool';
import { healthRead } from './tools/HealthTool';
import { launchApp } from './tools/LaunchAppTool';
import { timeTool } from './tools/TimeTool';
import { phoneDial, messageDraft, openSettings, timerSet, mapsOpen } from './tools/PhoneActionsTool';
import { createDeviceControlTools } from './tools/DeviceControlTool';
import type { ToolDefinition } from '../types/tool';

/**
 * Module-level singletons. Survive router remounts and are reachable from
 * non-React code (SecurityGate confirm bridge). Exposed to components via
 * ServicesContext.
 */
class Services {
  readonly store = appStore;
  readonly engine = new LLMEngineService();
  readonly tools = new ToolRegistry();
  readonly security = new SecurityGate((entry) => {
    void this.store.appendAudit(entry).catch((error) => console.warn('Unable to save activity log:', error));
  });
  readonly embeddings = new EmbeddingService();
  readonly memory = new MemoryService(this.embeddings);
  readonly actions = new UserActionService(this.tools, this.security, () => this.orchestrator.busy);
  readonly orchestrator: AgentOrchestrator = new AgentOrchestrator(
    this.engine,
    this.tools,
    this.security,
    {},
    this.memory,
    this.actions
  );
  readonly speech = new WhisperService();

  private wired = false;

  /** Register every device-action tool once (deny-by-default registry). */
  wireTools(): void {
    if (this.wired) return;
    const all: ToolDefinition[] = [
      timeTool,
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
      phoneDial,
      messageDraft,
      openSettings,
      timerSet,
      mapsOpen,
      ...createDeviceControlTools((tool, allowed) => this.security.recordNativeReview(tool, allowed)),
    ];
    this.tools.registerAll(all);
    this.wired = true;
  }
}

export const services = new Services();

// Wire the tool registry at module init: expo-router imports every route file
// up front, so screens (e.g. the chat tool toggles) can read the registry
// before any React effect has run.
services.wireTools();

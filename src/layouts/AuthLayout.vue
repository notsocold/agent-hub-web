<script setup lang="ts"></script>

<template>
  <div class="auth-shell">
    <aside class="brand-pane" aria-hidden="true">
      <div class="brand-row">
        <span class="brand-mark">A</span>
        <span class="brand-name">Agent Hub</span>
      </div>

      <div class="brand-copy">
        <p class="eyebrow mono">MULTI-AGENT DISPATCH DESK</p>
        <h1>把对话、工具与远程智能体，<br />收进同一张工作台。</h1>
        <p class="lede">
          主智能体负责调度，远程 Agent
          负责专长；每一次工具调用、审批与产出，都留在同一条运行轨迹里。
        </p>
        <ul class="points">
          <li><span class="point-dot" data-kind="skill"></span>技能与 MCP 按需装配</li>
          <li><span class="point-dot" data-kind="a2a"></span>A2A 任务可追踪、可取消</li>
          <li><span class="point-dot" data-kind="approval"></span>外部写操作先审批再执行</li>
        </ul>
      </div>

      <p class="brand-foot mono">v0.1.0 · M1 · 内部预览</p>
    </aside>

    <main class="form-pane">
      <div class="form-wrap">
        <slot />
      </div>
    </main>
  </div>
</template>

<style scoped>
.auth-shell {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(420px, 0.95fr);
  height: 100dvh;
  background: var(--paper);
}

.brand-pane {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 40px 48px;
  overflow: hidden;
  color: #f4f3ec;
  background:
    radial-gradient(120% 90% at 10% 0%, rgba(147, 190, 209, 0.28), transparent 55%),
    linear-gradient(145deg, #12394d 0%, #17465e 48%, #0f2f40 100%);
}

.brand-pane::after {
  position: absolute;
  inset: 0;
  pointer-events: none;
  content: '';
  background-image:
    linear-gradient(rgba(244, 243, 236, 0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(244, 243, 236, 0.045) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: linear-gradient(to bottom, black, transparent 85%);
}

.brand-row {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 1px solid rgba(244, 243, 236, 0.35);
  border-radius: 7px;
  font-family: var(--font-mono);
  font-size: 12px;
}

.brand-copy {
  position: relative;
  z-index: 1;
  max-width: 560px;
}

.eyebrow {
  margin-bottom: 18px;
  color: #d4a04a;
  font-size: 10.5px;
  letter-spacing: 0.14em;
}

h1 {
  font-size: clamp(30px, 3.2vw, 46px);
  font-weight: 620;
  line-height: 1.16;
  letter-spacing: -0.03em;
}

.lede {
  max-width: 480px;
  margin-top: 20px;
  color: rgba(244, 243, 236, 0.72);
  font-size: 14px;
  line-height: 1.75;
}

.points {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 28px;
  color: rgba(244, 243, 236, 0.86);
  font-size: 13px;
}

.points li {
  display: flex;
  align-items: center;
  gap: 10px;
}

.point-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #d4a04a;
  box-shadow: 0 0 0 4px rgba(212, 160, 74, 0.16);
}

.point-dot[data-kind='skill'] {
  background: #8dbba0;
  box-shadow: 0 0 0 4px rgba(141, 187, 160, 0.16);
}

.point-dot[data-kind='a2a'] {
  background: #8cc7bf;
  box-shadow: 0 0 0 4px rgba(140, 199, 191, 0.16);
}

.brand-foot {
  position: relative;
  z-index: 1;
  color: rgba(244, 243, 236, 0.45);
  font-size: 10px;
  letter-spacing: 0.08em;
}

.form-pane {
  display: grid;
  place-items: center;
  padding: 32px;
  overflow: auto;
  background: var(--paper);
}

.form-wrap {
  width: min(100%, 372px);
}

@media (max-width: 900px) {
  .auth-shell {
    grid-template-columns: minmax(0, 1fr);
  }

  .brand-pane {
    display: none;
  }

  .form-pane {
    background:
      radial-gradient(90% 60% at 50% 0%, var(--prussian-soft), transparent 70%), var(--paper);
  }
}
</style>

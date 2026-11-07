<script>
  import { _ } from 'svelte-i18n';
  import { normalizeAvatar, skinColors, hairColors, eyeColors } from '../../lib/family-avatar.js';

  export let avatar = null;
  export let mood = 'smile';
  export let decorative = false;

  $: profile = normalizeAvatar(avatar);
  $: isRabbit = profile.kind === 'rabbit';
  $: outfit = profile.kind === 'manga_woman' ? '#a94163' : '#3c596e';
  $: skin = skinColors[profile.skin];
  $: hair = hairColors[profile.hair];
  $: eyes = eyeColors[profile.eyes];
</script>

<svg viewBox="0 0 160 146" class="mascot" role="img"
  aria-hidden={decorative ? 'true' : undefined}
  aria-label={decorative ? undefined : $_(`family_avatar.expression.${mood}`, { values: { name: $_(`family_avatar.kind.${profile.kind}`) } })}
  data-kind={profile.kind} data-mood={mood}>
  <ellipse cx="80" cy="135" rx="46" ry="6" fill="#290c1b" opacity=".28" />
  <g stroke="#391e2c" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round">
    {#if isRabbit}
      <path d="M53 116C42 110 33 116 35 124C36 132 47 135 55 129" fill="#ffefe2" />
      <path d="M59 110Q49 120 54 130Q63 139 80 132Q96 139 106 130Q112 120 100 110Z" fill="#ffefe2" />
      <path d="M52 62C42 54 37 36 39 22C41 8 51 7 58 16C66 25 68 43 68 57Z" fill="#fff4e7" />
      <path d="M94 57C95 41 102 19 115 14C126 10 133 16 129 26C126 35 115 37 114 53L107 65Z" fill="#fff4e7" />
      <path d="M49 22C54 20 61 38 61 52C56 52 46 39 46 27Q46 23 49 22Z M110 51C108 43 115 29 122 25C123 30 113 38 113 50Z" fill="#f3a7b0" stroke="none" />
      <path d="M80 53C105 53 124 69 124 89C124 108 105 118 80 118C55 118 36 108 36 89C36 69 55 53 80 53Z" fill="#fff4e7" />
      <path d="M61 118Q79 125 99 117L98 125Q80 132 62 125Z M95 124Q103 126 102 137L95 134L92 138L90 126" fill="#b44465" />
      <path d="M70 81Q80 86 90 81" fill="none" stroke="#f7dbcd" stroke-width="2" />
    {:else}
      {#if profile.style === 'long'}
        <path d="M47 66C32 94 37 114 29 124Q53 131 62 112H98Q110 131 131 124C123 113 128 94 113 66Z" fill={hair} />
      {/if}
      <path d="M36 132Q41 115 65 112H95Q119 115 124 132Q106 138 80 138Q54 138 36 132Z" fill={outfit} />
      <path d="M68 111Q70 125 80 126Q90 125 92 111" fill={skin} />
      <path d="M45 79C31 72 29 94 46 99M115 79C129 72 131 94 114 99" fill={skin} />
      <path d="M80 37C105 37 117 53 117 79C117 103 101 116 80 119C59 116 43 103 43 79C43 53 55 37 80 37Z" fill={skin} />
      {#if profile.style === 'long'}
        <path d="M40 83C27 58 45 26 63 25C82 14 107 23 116 40C130 52 125 74 120 86L110 68Q103 63 96 45C82 65 60 58 53 69L47 96Z" fill={hair} />
        <path d="M50 54Q63 34 84 34" fill="none" stroke="#ffffff" opacity=".22" />
        <path d="M110 55L116 60M108 59L114 64" fill="none" stroke="#ffe2ac" />
      {:else if profile.style === 'curly'}
        <path d="M42 80C27 77 27 62 35 56C27 45 37 33 47 34C44 21 64 15 71 25C79 11 97 15 102 25C114 17 127 32 121 40C136 44 135 60 126 65C132 76 121 84 115 80L108 60Q98 63 92 53Q82 66 70 57Q62 70 52 63Z" fill={hair} />
        <path d="M47 48Q49 40 57 41M77 40Q79 30 89 34M103 44Q111 35 117 44" fill="none" stroke="#ffffff" opacity=".22" />
      {:else if profile.style === 'short'}
        <path d="M43 81Q28 59 43 37L33 36Q44 29 54 28L48 21Q67 18 78 23L90 16L91 23Q107 24 112 33L126 34L117 42Q131 60 116 84L109 63L103 48Q92 62 70 66L79 53Q66 63 54 65L49 85Z" fill={hair} />
        <path d="M54 43Q70 31 87 31" fill="none" stroke="#ffffff" opacity=".22" />
      {:else}
        <path d="M45 69C46 49 60 39 80 39C100 39 114 49 115 69Q105 51 80 51Q55 51 45 69Z" fill={hair} stroke="none" opacity=".55" />
      {/if}
      <path d="M66 118L73 134L80 126L87 134L94 118" fill="none" stroke="#fff2e5" stroke-width="2" />
    {/if}
    <ellipse cx="55" cy="99" rx="8" ry="3.7" fill="#e98394" stroke="none" opacity=".62" />
    <ellipse cx="105" cy="99" rx="8" ry="3.7" fill="#e98394" stroke="none" opacity=".62" />
    {#each [63, 97] as x}
      <g transform="translate({x} 87)">
        {#if mood === 'calm'}
          <path d="M-5 2Q0 -3 5 2" fill="none" />
        {:else if isRabbit}
          <ellipse cx="0" cy="0" rx={mood === 'curious' ? 4.2 : 3.6} ry={mood === 'curious' ? 5 : 5.8} fill="#391e2c" stroke="none" />
          <circle cx="1" cy="-2" r="1.25" fill="#fff" stroke="none" />
        {:else}
          <path d="M-9 -1Q-3 -9 7 -4Q8 4 1 6Q-6 7 -9 -1Z" fill="#fffbf7" stroke-width="1.7" />
          <ellipse cx="0" cy="0" rx="4.4" ry={mood === 'curious' ? 5 : 5.9} fill={eyes} stroke="none" />
          <circle cx="1.5" cy="-2" r="1.6" fill="#fff" stroke="none" />
        {/if}
        {#if mood === 'curious'}
          <path d="M-4 -12Q0 -15 5 -12" fill="none" stroke-width="1.9" />
        {/if}
      </g>
    {/each}
    {#if isRabbit}
      <path d="M76 96Q80 93 84 96L80 99Z" fill="#c7647c" stroke-width="1.4" />
    {:else if profile.glasses}
      <rect x="51" y="79" width="25" height="17" rx="5" fill="none" stroke-width="1.9" />
      <rect x="84" y="79" width="25" height="17" rx="5" fill="none" stroke-width="1.9" />
      <path d="M76 85Q80 82 84 85M51 85L44 82M109 85L116 82" fill="none" stroke-width="1.9" />
    {/if}
    {#if mood === 'curious'}
      <ellipse cx="80" cy="105" rx="3" ry="3.7" fill="#d9808c" stroke-width="1.5" />
    {:else if isRabbit}
      <path d="M73 103Q76 107 80 101Q84 107 87 103" fill="none" stroke-width="1.8" />
    {:else}
      <path d={mood === 'calm' ? 'M75 103Q80 107 85 103' : 'M73 102Q80 111 87 102Q80 104 73 102Z'} fill={mood === 'calm' ? 'none' : '#e7919c'} stroke-width="1.7" />
    {/if}
  </g>
</svg>

<style>
  .mascot { display: block; width: min(100%, 148px); max-height: 100%; }
</style>

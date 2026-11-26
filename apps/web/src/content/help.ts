/**
 * In-app guides on the Help page. Each guide is a list of short sections; a
 * section is paragraphs and/or bullet lists. Keep wording plain and match the
 * labels people see on screen (bold them with **double asterisks**).
 */
export type HelpGuideId = 'employee' | 'manager' | 'admin';

export interface HelpSection {
  id: string;
  title: string;
  /** Paragraphs, or bullet lists when the entry is an array. */
  body: Array<string | string[]>;
}

export interface HelpGuide {
  id: HelpGuideId;
  title: string;
  summary: string;
  sections: HelpSection[];
}

const employee: HelpGuide = {
  id: 'employee',
  title: 'Employee guide',
  summary: 'Your day in Gnomon: timecard, timesheets, leave, corrections and messages.',
  sections: [
    {
      id: 'basics',
      title: 'How a workday is counted',
      body: [
        [
          'All times are India time (IST).',
          'A workday runs from **07:00 to 07:00 the next morning**. Work at 02:00 on Tuesday still belongs to Monday.',
          'The normal requirement is **9 hours**, Monday to Friday. Weekends and company holidays are shown separately.',
          'For office days, biometric punches count first, then access-card swipes, then the website timecard.',
        ],
      ],
    },
    {
      id: 'timecard',
      title: 'Start and stop your timecard',
      body: [
        'On **Overview**, choose your shift and whether you are working **from office** or **from home**, then press **Start**. Press **Stop** when you finish. You can start and stop several times a day; the sessions add up.',
        'The flip clock shows time worked today, and the progress bar shows how far you are through the 9-hour day. **My timecard** shows every session in detail.',
      ],
    },
    {
      id: 'forgot-stop',
      title: 'If you forget to stop your timecard',
      body: [
        'A timecard still running at **07:00 the next morning** is stopped automatically at 07:00. That day then appears in **Catch-up** under **Timecard stopped automatically**:',
        [
          '**It’s correct – save** keeps the 07:00 exit straight away (for example, if you really worked overnight).',
          '**Change exit time** lets you enter the real time you left (it starts at your shift end) and a reason. It is sent for approval as a regularisation.',
        ],
        'Until you answer, the day counts as incomplete.',
      ],
    },
    {
      id: 'timesheets',
      title: 'Timesheets (show time)',
      body: [
        'Use **Timesheets** to record which show you worked on and for how long. Entries save directly — there is no approval step.',
        'Timesheets describe the work you did; they do not prove attendance on their own.',
      ],
    },
    {
      id: 'catch-up',
      title: 'Catch-up: missed and short days',
      body: [
        '**Catch-up** lists past days that need your attention: missing punches, a timecard that was not stopped, or fewer than 9 hours. The banner on **Overview** tells you when something is waiting.',
        'Pick one or more days and send a regularisation or a leave request for them in one go.',
      ],
    },
    {
      id: 'regularisation',
      title: 'Regularisation (attendance corrections)',
      body: [
        'Use **Regularisation** to correct a day’s in or out time. A day can be corrected only after it has closed — Monday’s correction from 07:00 on Tuesday.',
        [
          'Your reporting manager approves first, then HR or the attendance team.',
          'You can see each request’s progress and cancel it while it is still pending.',
          'A rejected request shows the reason, and the day returns to Catch-up.',
        ],
      ],
    },
    {
      id: 'leave',
      title: 'Leave',
      body: [
        'Apply from **Leave**. Choose the type (casual, earned, compensatory off or unpaid), the dates, and full day or first/second half.',
        [
          'Your request follows your department’s approval route: one or two stages.',
          'Pending requests reserve balance; approved requests use it.',
          'Approved half-day leave lowers the requirement for that day to 4.5 hours.',
          'A balance shown as **Not set** has not been configured by HR yet — it is not zero.',
        ],
      ],
    },
    {
      id: 'calendar',
      title: 'Calendar',
      body: [
        '**Calendar** shows each day’s status for the month — present, partial, absent, leave, pending correction, holiday or weekend.',
      ],
    },
    {
      id: 'availability',
      title: 'Availability and your status',
      body: [
        '**Availability** lists everyone with their status, email and login ID.',
        [
          '**Automatic** (default): you show as Available while your timecard is running and Away when it is stopped.',
          '**Do not disturb** or **Always available** override that and hide your real status from colleagues.',
        ],
        'Change it by clicking your name at the top right of the page.',
      ],
    },
    {
      id: 'messages',
      title: 'Messages and notifications',
      body: [
        'The bell at the top shows notifications such as leave decisions and messages from managers. Messages also appear on **Overview** under the greeting until they expire. Press ✓ to mark one as read.',
      ],
    },
  ],
};

const manager: HelpGuide = {
  id: 'manager',
  title: 'Manager guide',
  summary: 'Approvals, your team’s attendance, shows and sending messages.',
  sections: [
    {
      id: 'approvals',
      title: 'Approving leave',
      body: [
        '**Leave approvals** lists requests waiting for you. Open one to see the dates, balance and the person’s calendar, then approve or reject. A rejection needs a reason.',
        [
          'Leave can have two stages. When stage 2 has several approvers, the first decision completes it.',
          'You can never approve your own request.',
          'A request keeps the route it was created with, even if routes change later.',
        ],
      ],
    },
    {
      id: 'regularisations',
      title: 'Approving regularisations',
      body: [
        '**Regularisation approvals** lists attendance corrections. As reporting manager you decide first; HR or the attendance team then gives the final approval.',
        'Check the requested times against the punches shown with the request. For an automatic 07:00 stop, the request contains the exit time the employee says is right.',
      ],
    },
    {
      id: 'team',
      title: 'Your team’s attendance',
      body: [
        [
          '**Team calendar** shows the status of everyone you manage, day by day.',
          '**Team timesheets** shows how your team’s time is spread across shows.',
          '**Attendance details** shows the raw punches and website sessions behind each day.',
        ],
      ],
    },
    {
      id: 'shows',
      title: 'Shows',
      body: [
        'Show managers use **Shows** to create shows and change their status. Only **active** shows can be picked in Timesheets, so put finished shows on hold or complete them.',
      ],
    },
    {
      id: 'messages',
      title: 'Sending a message to employees',
      body: [
        'On **Overview**, press **Send message**. Add a title and the message, then choose:',
        [
          '**Everyone**, or **Specific departments** (pick one or more).',
          'How long it stays on Overview: 1 day up to 30 days (1 week by default).',
        ],
        'Each person gets a bell notification and sees the message on their Overview page. Use the 🗑 button on your message to withdraw it from everyone.',
        'Reporting managers, show managers, HR, admins and anyone with direct reports or leave approvees can send messages.',
      ],
    },
  ],
};

const admin: HelpGuide = {
  id: 'admin',
  title: 'Admin guide',
  summary: 'People, access, imports, leave policy, site preferences and monitoring.',
  sections: [
    {
      id: 'add-person',
      title: 'Add a person and give them access',
      body: [
        [
          'Search **People** first — attendance imports may already have created the profile.',
          'Check the employee code, name, real email, department, status and reporting manager.',
          'A System Administrator opens **Administration → Access & roles**, finds the person and creates an account with a temporary password (12+ characters). Share it privately.',
          'New accounts get the Employee role. Add Manager, HR, Attendance or Admin roles only when needed, and check the scope — it decides whom they can manage.',
        ],
        'With LDAP turned on, people can sign in with their domain login instead; an account is created on first sign-in.',
      ],
    },
    {
      id: 'remove-person',
      title: 'When someone leaves',
      body: [
        'Reassign any requests waiting on them, disable their account in **Access & roles**, and mark the profile **inactive** in **People**. History is kept.',
        '**Delete** in People is only for profiles created by mistake: it is refused once a person has attendance, timesheets, leave or corrections, or approves for others.',
      ],
    },
    {
      id: 'directory',
      title: 'Employee directory and approval routes',
      body: [
        'In **Administration → Site preferences**, import the user directory CSV first, review it, then import department approvals if routes changed. Resolve missing or ambiguous approver names before you finish.',
      ],
    },
    {
      id: 'imports',
      title: 'Import attendance',
      body: [
        [
          'Open **Administration → Attendance imports** and choose biometric CSV, access-card CSV or door workbook.',
          'Use **Add new punches** for normal uploads. Uploading the same file again does not add punches twice.',
          'Review the accepted, duplicate, ignored and rejected counts, and follow up every rejection.',
          'Spot-check a few people in **Attendance details**, including an overnight shift.',
        ],
        'To undo a mistaken upload use **Import history → Delete**. To correct a period use **Replace attendance for a period** — it replaces that source for **everyone** in those dates, so upload the complete corrected file.',
      ],
    },
    {
      id: 'leave-policy',
      title: 'Leave balances and holidays',
      body: [
        '**Administration → Leave & holidays** holds leave balances and the company holiday calendar. Review both before each new year. A holiday change can be blocked when it would change an existing leave request — resolve that request first.',
        'Leave balance and timecard data imports are under **Site preferences**.',
      ],
    },
    {
      id: 'site-preferences',
      title: 'Site preferences',
      body: [
        [
          '**Shifts** — shift times and the default shift. Shift end is used as the suggested exit after an automatic 07:00 stop.',
          '**Email (SMTP)** — outgoing mail settings; send a test email to check them.',
          '**LDAP / Active Directory** — server (use ldaps:// on port 636), base DN, service account and search filter. Use **Test** before saving.',
          '**Tips** — the hints shown to employees.',
        ],
      ],
    },
    {
      id: 'automatic',
      title: 'What runs automatically',
      body: [
        [
          'Every 15 minutes: timecards left running past 07:00 are stopped and sent to the employee’s Catch-up, and each rostered employee gets a default attendance row for the day.',
          'Attendance is recalculated whenever punches, sessions, leave or corrections change.',
        ],
      ],
    },
    {
      id: 'monitoring',
      title: 'Monitoring and audit',
      body: [
        '**System events** records sign-ins, changes, imports, automatic stops, messages and errors, with who did it and from which address. Use it to answer “who changed this?” and to spot failures.',
        'Suggested routine: daily — check imports, rejected rows and pending approvals; month end — clear outstanding corrections before reports; before a new year — holidays and entitlements.',
      ],
    },
  ],
};

export const helpGuides: Record<HelpGuideId, HelpGuide> = { employee, manager, admin };

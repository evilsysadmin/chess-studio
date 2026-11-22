# Football: dedicated source and staging

Football of Matthias now belongs exclusively to [evilsysadmin/football-of-matthias](https://github.com/evilsysadmin/football-of-matthias). Its match, manager, artwork, quality gates and source artifacts are maintained there. Do not develop or reintroduce them in Chess Studio.

The Lab opens https://staging.football.shadowops.dpdns.org/ in a separate tab. Infra owns Pages/DNS delivery from the dedicated repository’s exact main SHA and successful visual/Web gates. Chess Studio no longer exports or publishes Football.

Existing careers remain untouched and purge-covered under `chess-study-football-manager-career-v1`. A signed-in player can explicitly export only that career from the Lab and import it into the new Football site. Different origins cannot read each other’s storage. No account/profile/authentication copy is transferred. Football validates by replay before writing and confirms replacement of an existing career. Its first staging has device-local careers and direct access, without claiming shared-account synchronization.

R2 is shared infrastructure: `football-of-matthias/` is protected from Chess Studio retention. Old `chess-football-godot/` releases remain rollback artifacts under their existing bounded policy; they are not an active publisher.

For the cutover, `Football · required visual gate` checks the external portal, the deployed dedicated release and native desktop/mobile Lab captures. The original visual/gameplay acceptance rules continue in the dedicated repository.

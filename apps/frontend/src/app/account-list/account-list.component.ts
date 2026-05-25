import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';

import { SignupService } from '../services/signup.service';

@Component({
  selector: 'app-account-list',
  standalone: true,
  imports: [AsyncPipe],
  templateUrl: './account-list.component.html',
  styleUrls: ['./account-list.component.scss'],
})
export class AccountListComponent {
  private readonly accountService = inject(SignupService);

  readonly accounts$ = this.accountService.findAll();
}
